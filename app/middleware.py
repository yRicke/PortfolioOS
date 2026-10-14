from app.error_views import erro_405
from django.utils.cache import patch_vary_headers


class JanelaDesktopMiddleware:
    """Permite janelas do próprio desktop, mantendo o bloqueio entre sites."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.os_embedded = (
            request.GET.get('janela') == '1'
            or request.headers.get('Sec-Fetch-Dest') == 'iframe'
        )
        resposta = self.get_response(request)
        if resposta.get('Content-Type', '').startswith('text/html'):
            if request.os_embedded:
                resposta['X-Frame-Options'] = 'SAMEORIGIN'
            # A versão completa e a janela nunca devem compartilhar um cache.
            patch_vary_headers(resposta, ('Sec-Fetch-Dest',))
        return resposta


class PaginaErroMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        resposta = self.get_response(request)
        if resposta.status_code == 405:
            return erro_405(request, resposta.headers.get('Allow'))
        return resposta
