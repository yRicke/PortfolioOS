# Catálogo local

O catálogo em `app/fixtures/portfolio_publicado.json` é uma cópia dos dados públicos de https://henriquevieira-seven.vercel.app/, obtida em 14 de outubro de 2026 pelo conector do portfólio. Contém 11 projetos, 11 capas e 35 imagens de galeria, com descrições, links, datas, ordem e destaque.

Depois de aplicar as migrations, execute:

```powershell
python manage.py importar_portfolio_publicado
```

O comando cadastra os projetos e baixa as mídias para o armazenamento local. Uma segunda execução preserva os projetos já cadastrados, identificados pelo título. Não é uma fixture para `loaddata`.

O importador é destinado ao SQLite local e recusa bancos remotos. Não altera o portfólio publicado. Banco, mídias e credenciais não são versionados; o catálogo e o comando permitem reproduzir a configuração em outro checkout.

Para verificar somente os dados textuais em um banco descartável:

```powershell
python manage.py importar_portfolio_publicado --sem-midias
```

Essa opção não baixa imagens. Para a cópia visual completa, use o comando normal em um banco novo.
