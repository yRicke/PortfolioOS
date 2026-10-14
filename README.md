# Henri OS

Portfólio de Henrique Vieira em Django, com um desktop inspirado no Windows 98. O estudo original permanece em `design/henri-os.html`; a aplicação usa templates e arquivos estáticos próprios.

## Executar localmente

Python 3.13, conforme a configuração existente do projeto:

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python manage.py migrate
python manage.py importar_portfolio_publicado
python manage.py runserver
```

Abra http://127.0.0.1:8000/. O catálogo publicado já foi importado neste workspace. O comando de importação preserva registros existentes; consulte [catálogo local](docs/catalogo-local.md).

Para entrar na administração, crie sua conta local:

```powershell
python manage.py createsuperuser
```

Depois, use **Iniciar → Administrador**. Contas com as permissões existentes podem organizar, adicionar, editar e excluir projetos, fazer uploads de capas e galerias e gerenciar a chave da API.

## Desktop

- Projetos no Explorador, apresentação no Bloco de Notas, contato no cliente de e-mail e currículo como documento imprimível.
- Janelas independentes com arraste, redimensionamento, minimização, maximização, restauração e alternância pela barra de tarefas.
- Abra os ícones com um clique. As janelas também podem ser movidas e redimensionadas pelas setas quando o título ou a alça está em foco.
- Boot de 2,4 segundos na primeira visita da sessão, com opção de pular e reiniciar pelo menu Iniciar.
- Cursor personalizado, carregamento de aplicativos e textura de tela antiga. O Painel de Controle permite ajustar o atraso, a textura e os sons opcionais.
- No celular, uma janela por vez fica visível, mantendo a alternância pela barra de tarefas e a maximização.

As URLs Django continuam acessíveis diretamente. Dentro do desktop, páginas da própria origem são abertas em janelas com iframes; login, formulários, CSRF, permissões e redirecionamentos continuam no servidor. O enquadramento entre sites permanece bloqueado. API REST e MCP mantêm seus contratos.

## Verificação

```powershell
python manage.py check
python manage.py test app --noinput
```

Para verificar os fluxos no navegador:

```powershell
pip install -r requirements-dev.txt
python scripts/verificar_desktop.py
```

No Windows, o script usa Microsoft Edge em modo headless. Em outros ambientes, instale o Chromium com `python -m playwright install chromium`. A verificação cria uma cópia temporária do banco e das mídias, uma conta administrativa descartável e um servidor isolado. Testa boot, carregamento, janelas, galerias, login, cadastro, upload, organização, edição, exclusão e layout mobile. Não modifica os dados de desenvolvimento. Capturas ficam em `.codex/artifacts/desktop/`, ignoradas pelo Git.

O currículo usa as informações já presentes no portfólio e permite imprimir ou salvar em PDF pelo navegador. Dados como histórico profissional detalhado podem ser completados posteriormente.
