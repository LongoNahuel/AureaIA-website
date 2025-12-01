import http.server
import socketserver
import webbrowser
import os

PORT = 8000

# Cambiar al directorio del archivo
os.chdir(os.path.dirname(os.path.abspath(__file__)))

Handler = http.server.SimpleHTTPRequestHandler

print(f"Servidor iniciado en http://localhost:{PORT}")
print("Presiona Ctrl+C para detener el servidor")

# Abrir el navegador automáticamente
webbrowser.open(f'http://localhost:{PORT}')

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    httpd.serve_forever()
