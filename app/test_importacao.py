import json
from io import StringIO
from pathlib import Path

from django.core.management import call_command
from django.test import TestCase
from django.utils.dateparse import parse_datetime

from app.models import Projeto


class ImportacaoPortfolioTest(TestCase):
    def setUp(self):
        self.catalogo = json.loads((Path(__file__).parent / 'fixtures' / 'portfolio_publicado.json').read_text(encoding='utf-8'))['projetos']

    def test_importa_metadados_ordem_datas_e_destaque_sem_duplicar(self):
        call_command('importar_portfolio_publicado', sem_midias=True, stdout=StringIO())
        self.assertEqual(Projeto.objects.count(), len(self.catalogo))
        self.assertEqual(Projeto.objects.filter(destaque=True).count(), 1)
        for item in self.catalogo:
            projeto = Projeto.objects.get(titulo=item['titulo'])
            self.assertEqual(projeto.descricao, item['descricao'])
            self.assertEqual(projeto.url, item['url'])
            self.assertEqual(projeto.ordem, item['ordem'])
            self.assertEqual(projeto.data_criacao, parse_datetime(item['data_criacao']))
        call_command('importar_portfolio_publicado', sem_midias=True, stdout=StringIO())
        self.assertEqual(Projeto.objects.count(), len(self.catalogo))

    def test_preserva_projeto_e_destaque_locais_existentes(self):
        existente = Projeto.objects.create(titulo=self.catalogo[0]['titulo'], descricao='Minha edição local', destaque=True, ordem=99)
        call_command('importar_portfolio_publicado', sem_midias=True, stdout=StringIO())
        existente.refresh_from_db()
        self.assertEqual(existente.descricao, 'Minha edição local')
        self.assertEqual(existente.ordem, 99)
        self.assertTrue(existente.destaque)
        self.assertEqual(Projeto.objects.filter(destaque=True).count(), 1)
