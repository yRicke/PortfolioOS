import json
from datetime import date
from pathlib import Path
from urllib.parse import unquote, urlparse
from urllib.request import Request, urlopen

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from app.models import ImagemProjeto, Projeto


class Command(BaseCommand):
    help = 'Copia o catálogo publicado para o banco local, sem duplicar projetos existentes.'

    def add_arguments(self, parser):
        parser.add_argument('--arquivo', type=Path, default=Path(__file__).resolve().parents[2] / 'fixtures' / 'portfolio_publicado.json')
        parser.add_argument('--sem-midias', action='store_true', help='Importa apenas os dados textuais.')

    def handle(self, *args, **options):
        if settings.DATABASES['default']['ENGINE'] != 'django.db.backends.sqlite3':
            raise CommandError('Este comando de preparação local deve ser executado com SQLite, sem DATABASE_URL.')
        try:
            dados = json.loads(options['arquivo'].read_text(encoding='utf-8'))
        except (OSError, ValueError) as erro:
            raise CommandError(f'Não foi possível ler o catálogo: {erro}') from erro
        origem = urlparse(dados['origem'])
        criados = 0
        for item in dados['projetos']:
            if Projeto.objects.filter(titulo=item['titulo']).exists():
                self.stdout.write(f'Já cadastrado: {item["titulo"]}')
                continue
            try:
                capa = None
                imagens = []
                if not options['sem_midias']:
                    capa = self._baixar(item['capa_url'], origem)
                    imagens = [(imagem, self._baixar(imagem['url'], origem)) for imagem in item['imagens']]
                with transaction.atomic():
                    projeto = Projeto.objects.create(
                        titulo=item['titulo'], descricao=item['descricao'], url=item['url'],
                        data_desenvolvimento=date.fromisoformat(item['data_desenvolvimento']) if item['data_desenvolvimento'] else None,
                        ordem=item['ordem'], destaque=item['destaque'] and not Projeto.objects.filter(destaque=True).exists(),
                        **({'capa': capa} if capa else {}),
                    )
                    Projeto.objects.filter(pk=projeto.pk).update(data_criacao=item['data_criacao'])
                    for imagem, arquivo in imagens:
                        registro = ImagemProjeto.objects.create(projeto=projeto, imagem=arquivo, ordem=imagem['ordem'])
                        ImagemProjeto.objects.filter(pk=registro.pk).update(data_criacao=imagem['data_criacao'])
            except Exception as erro:
                raise CommandError(f'Falha ao importar {item["titulo"]}: {erro}') from erro
            criados += 1
            self.stdout.write(self.style.SUCCESS(f'Importado: {projeto.titulo} ({len(imagens)} imagens)'))
        self.stdout.write(self.style.SUCCESS(f'{criados} projetos importados. Os projetos existentes foram preservados.'))

    @staticmethod
    def _baixar(url, origem):
        destino = urlparse(url)
        if destino.scheme != 'https' or destino.netloc != origem.netloc:
            raise ValueError('A mídia deve pertencer ao site de origem do catálogo.')
        requisicao = Request(url, headers={'User-Agent': 'HenriOS-Import/1.0'})
        with urlopen(requisicao, timeout=30) as resposta:
            conteudo = resposta.read(10 * 1024 * 1024 + 1)
        if len(conteudo) > 10 * 1024 * 1024:
            raise ValueError('A imagem excede o limite de 10 MB.')
        return ContentFile(conteudo, name=Path(unquote(destino.path)).name)
