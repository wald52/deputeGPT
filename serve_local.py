#!/usr/bin/env python3
"""Serveur local avec headers COOP/COEP pour WebGPU + WASM threading."""

import http.server
import socketserver

PORT = 8000

class COOPCOEPHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        self.send_header('Cross-Origin-Resource-Policy', 'cross-origin')
        super().end_headers()

    def guess_type(self, path):
        mimetype = super().guess_type(path)
        if path.endswith('.js'):
            return 'application/javascript'
        if path.endswith('.wasm'):
            return 'application/wasm'
        return mimetype

if __name__ == '__main__':
    with socketserver.TCPServer(('', PORT), COOPCOEPHandler) as httpd:
        print(f'Serveur local avec headers COOP/COEP: http://localhost:{PORT}')
        print('Appuyez sur Ctrl+C pour arreter.')
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\nServeur arrete.')
