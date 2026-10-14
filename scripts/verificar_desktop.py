"""Verifica o desktop e o CRUD em uma cópia temporária do banco e das mídias."""
import os
import secrets
import shutil
import socket
import sqlite3
import subprocess
import sys
import time
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def query(database, sql, parameters=()):
    connection = sqlite3.connect(database)
    try:
        return connection.execute(sql, parameters).fetchall()
    finally:
        connection.close()


def main():
    from PIL import Image
    from playwright.sync_api import expect, sync_playwright

    temporary_root = ROOT / '.codex' / 'qa'
    artifacts = ROOT / '.codex' / 'artifacts' / 'desktop'
    temporary_root.mkdir(parents=True, exist_ok=True)
    artifacts.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix='desktop-', dir=temporary_root) as directory:
        qa_root = Path(directory)
        if (ROOT / 'db.sqlite3').exists():
            with sqlite3.connect(ROOT / 'db.sqlite3') as source, sqlite3.connect(qa_root / 'db.sqlite3') as target:
                source.backup(target)
            source.close()
            target.close()
        if (ROOT / 'media').exists():
            shutil.copytree(ROOT / 'media', qa_root / 'media')
        os.environ['DJANGO_SETTINGS_MODULE'] = 'scripts.browser_settings'
        os.environ['HENRI_OS_QA_ROOT'] = str(qa_root)
        os.environ.pop('DATABASE_URL', None)
        import django
        django.setup()
        from django.contrib.auth import get_user_model
        from django.core.management import call_command
        from app.models import Projeto
        call_command('migrate', verbosity=0)
        username, password = 'qa-' + secrets.token_hex(5), secrets.token_urlsafe(24)
        get_user_model().objects.create_superuser(username=username, password=password)
        initial_count = Projeto.objects.count()
        with socket.socket() as port_socket:
            port_socket.bind(('127.0.0.1', 0))
            port = port_socket.getsockname()[1]
        base = f'http://127.0.0.1:{port}'
        with (artifacts / 'server.log').open('w', encoding='utf-8') as log:
            server = subprocess.Popen(
                [sys.executable, str(ROOT / 'manage.py'), 'runserver', f'127.0.0.1:{port}', '--noreload'],
                cwd=ROOT, stdout=log, stderr=log,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0,
            )
            try:
                for _ in range(100):
                    try:
                        with urlopen(base, timeout=1) as response:
                            if response.status == 200:
                                break
                    except OSError:
                        if server.poll() is not None:
                            raise RuntimeError('O servidor de verificação encerrou durante a inicialização.')
                        time.sleep(.1)
                else:
                    raise RuntimeError('O servidor de verificação não iniciou.')
                with sync_playwright() as playwright:
                    browser = playwright.chromium.launch(channel='msedge', headless=True) if os.name == 'nt' else playwright.chromium.launch(headless=True)
                    context = browser.new_context(viewport={'width': 1280, 'height': 800})
                    page = context.new_page()
                    errors = []
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.goto(base)
                    expect(page.locator('[data-os-boot]')).to_be_visible()
                    page.screenshot(path=str(artifacts / 'boot.png'))
                    page.locator('[data-os-skip-boot]').click()
                    assert page.locator('.os-scanlines').evaluate("(el) => getComputedStyle(el).pointerEvents") == 'none'
                    assert page.locator('.os-scanlines').evaluate("(el) => getComputedStyle(el, '::after').animationName") == 'os-crt-sweep'
                    expect(page.locator('[data-os-window="inicio"] h1')).to_contain_text('Henrique Vieira')
                    page.screenshot(path=str(artifacts / 'desktop.png'))
                    page.locator('.os-shortcuts [data-os-app="projetos"]').click()
                    expect(page.locator('.os-loading-status')).to_be_visible()
                    page.mouse.move(450, 140)
                    expect(page.locator('.os-cursor-loader')).to_be_visible()
                    explorer = page.frame_locator('[data-os-window="projetos"] iframe')
                    expect(explorer.locator('[data-project-card]')).to_have_count(initial_count)
                    expect(explorer.locator('body')).to_have_class('os-embedded ')
                    assert explorer.locator('#os-desktop').count() == 0
                    project_window = page.locator('[data-os-window="projetos"]')
                    before = project_window.bounding_box()
                    bar = project_window.locator('.os-titlebar').bounding_box()
                    page.mouse.move(bar['x'] + 80, bar['y'] + 14)
                    page.mouse.down(); page.mouse.move(bar['x'] + 155, bar['y'] + 55, steps=8); page.mouse.up()
                    after = project_window.bounding_box()
                    assert after['x'] > before['x'] and after['y'] > before['y'], 'A janela não foi arrastada.'
                    project_window.locator('[data-window-action="maximize"]').click()
                    expect(project_window).to_have_class('os-window is-active is-maximized')
                    project_window.locator('[data-window-action="maximize"]').click()
                    assert abs(project_window.bounding_box()['x'] - after['x']) < 2
                    project_window.locator('[data-window-action="minimize"]').click()
                    expect(project_window).to_be_hidden()
                    page.locator('[data-os-task="projetos"]').click()
                    expect(project_window).to_be_visible()
                    page.screenshot(path=str(artifacts / 'projetos.png'))
                    if initial_count:
                        link = explorer.locator('.os-project-file > a').first
                        project_key = link.get_attribute('data-os-app')
                        link.click()
                        detail = page.frame_locator(f'[data-os-window="{project_key}"] iframe')
                        expect(detail.locator('[data-project-detail]')).to_be_visible()
                        if detail.locator('[data-project-carousel-next]').count():
                            detail.locator('[data-project-carousel-next]').click()
                            expect(detail.locator('[data-project-carousel-current]')).to_have_text('02')
                        page.screenshot(path=str(artifacts / 'projeto.png'))
                    assert page.locator('[data-os-window]').count() >= 2
                    page.locator('.os-shortcuts [data-os-app="configuracoes"]').click()
                    settings = page.locator('[data-os-window="configuracoes"]')
                    expect(settings).to_be_visible()
                    expect(settings.locator('[data-os-setting="delay"]')).to_have_value('600')
                    settings.locator('[data-os-setting="scanlines"]').uncheck()
                    assert page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--os-scan-opacity').trim()") == '0'
                    expect(page.locator('.os-scanlines')).to_be_hidden()
                    settings.locator('[data-os-setting="scanlines"]').check()
                    expect(page.locator('.os-scanlines')).to_be_visible()
                    settings.locator('[data-os-setting="scanlines"]').uncheck()
                    settings.locator('[data-os-setting="delay"]').select_option('1800')
                    expect(settings.locator('[data-os-setting="delay"]')).to_have_value('1800')
                    settings.locator('[data-os-setting="delay"]').select_option('0')
                    settings.locator('[data-window-action="close"]').click()
                    page.locator('[data-os-start]').click()
                    page.locator('.os-start-menu [data-os-restart]').click()
                    expect(page.locator('[data-os-boot]')).to_be_visible()
                    page.locator('[data-os-skip-boot]').click()
                    page.locator('[data-os-start]').click()
                    page.locator('.os-start-menu [data-os-app="entrar"]').click()
                    login = page.frame_locator('[data-os-window="entrar"] iframe')
                    login.locator('[name="username"]').fill(username)
                    login.locator('[name="password"]').fill(password)
                    login.locator('button[type="submit"]').click()
                    expect(page.locator('[data-os-window="entrar"]')).to_have_count(0)
                    page.locator('[data-os-start]').click()
                    expect(page.locator('.os-start-menu [data-os-app="painel_projetos"]')).to_be_visible()
                    page.locator('.os-start-menu [data-os-app="adicionar_projeto"]').click()
                    add = page.frame_locator('[data-os-window="adicionar_projeto"] iframe')
                    image = BytesIO(); Image.new('RGB', (30, 20), '#008080').save(image, format='PNG')
                    upload = {'name': 'qa.png', 'mimeType': 'image/png', 'buffer': image.getvalue()}
                    add.locator('[name="capa"]').set_input_files(upload)
                    add.locator('[name="imagens"]').set_input_files(upload)
                    add.locator('[name="titulo"]').fill('Projeto temporário de verificação')
                    add.locator('[name="descricao"]').fill('Criado pelo navegador em banco isolado.')
                    add.locator('[name="data_desenvolvimento"]').fill('2026-10')
                    add.locator('[name="url"]').fill('https://example.com/')
                    add.locator('button[type="submit"]').click()
                    expect(page.locator('[data-os-window="adicionar_projeto"]')).to_have_count(0)
                    database = qa_root / 'db.sqlite3'
                    created_id, cover = query(database, 'SELECT id, capa FROM app_projeto WHERE titulo = ?', ('Projeto temporário de verificação',))[0]
                    assert query(database, 'SELECT COUNT(*) FROM app_projeto')[0][0] == initial_count + 1
                    assert query(database, 'SELECT COUNT(*) FROM app_imagemprojeto WHERE projeto_id = ?', (created_id,))[0][0] == 1 and cover.endswith('.webp')
                    page.locator('[data-os-start]').click()
                    page.locator('.os-start-menu [data-os-app="painel_projetos"]').click()
                    organizer = page.frame_locator('[data-os-window="painel_projetos"] iframe')
                    expect(organizer.locator('[data-project-id]')).to_have_count(initial_count + 1)
                    item = organizer.locator(f'[data-project-id="{created_id}"]')
                    item.locator('[data-move="up"]').click()
                    organizer.locator('[data-organizer-save]').click()
                    expect(organizer.locator('[data-organizer-status]')).to_contain_text('sucesso')
                    item.locator('.organizer-actions a').click()
                    edit = page.frame_locator(f'[data-os-window="editar-{created_id}"] iframe')
                    edit.locator('[name="descricao"]').fill('Atualizado pelo navegador.')
                    edit.locator('button[type="submit"]').first.click()
                    expect(edit.locator('.message.success')).to_contain_text('atualizado')
                    assert query(database, 'SELECT descricao FROM app_projeto WHERE id = ?', (created_id,))[0][0] == 'Atualizado pelo navegador.'
                    edit.locator('[form="excluir-projeto"]').click()
                    expect(page.locator(f'[data-os-window="editar-{created_id}"]')).to_have_count(0)
                    assert not query(database, 'SELECT id FROM app_projeto WHERE id = ?', (created_id,))
                    assert query(database, 'SELECT COUNT(*) FROM app_projeto')[0][0] == initial_count
                    assert not errors, errors
                    context.close()
                    mobile = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
                    mobile_page = mobile.new_page(); mobile_page.on('pageerror', lambda error: errors.append(str(error)))
                    mobile_page.goto(base); mobile_page.locator('[data-os-skip-boot]').click()
                    mobile_page.locator('.os-shortcuts [data-os-app="projetos"]').click()
                    mobile_explorer = mobile_page.frame_locator('[data-os-window="projetos"] iframe')
                    expect(mobile_explorer.locator('[data-project-card]')).to_have_count(initial_count)
                    assert mobile_page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                    assert mobile_explorer.locator('html').evaluate('(el) => el.scrollWidth <= window.innerWidth')
                    mobile_page.screenshot(path=str(artifacts / 'mobile.png'))
                    mobile_page.locator('[data-os-window="projetos"] [data-window-action="maximize"]').click()
                    assert mobile_page.locator('[data-os-window="projetos"]').bounding_box()['y'] == 0
                    mobile_page.locator('[data-os-window="projetos"] [data-window-action="close"]').click()
                    expect(mobile_page.locator('[data-os-window="inicio"]')).to_be_visible()
                    reduced = browser.new_context(viewport={'width': 1280, 'height': 800}, reduced_motion='reduce')
                    reduced_page = reduced.new_page()
                    reduced_page.goto(base)
                    expect(reduced_page.locator('[data-os-boot]')).to_be_hidden()
                    assert reduced_page.locator('.os-scanlines').evaluate("(el) => getComputedStyle(el, '::after').animationName") == 'none'
                    reduced.close()
                    assert not errors, errors
                    browser.close()
                    print(f'Desktop, boot, janelas, galerias, login, CRUD, uploads, organização e mobile verificados. Catálogo: {initial_count} projetos. Sem erros JavaScript.')
                    print(f'Capturas: {artifacts}')
            finally:
                if os.name == 'nt' and server.poll() is None:
                    subprocess.run(['taskkill', '/PID', str(server.pid), '/T', '/F'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW, check=True)
                elif server.poll() is None:
                    server.terminate()
                server.wait(timeout=15)
                from django.db import connections
                connections.close_all()


if __name__ == '__main__':
    main()
