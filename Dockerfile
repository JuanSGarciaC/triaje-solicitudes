# Un solo contenedor: la API sirve el panel ya compilado.
FROM node:22-alpine AS panel
WORKDIR /panel
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app/backend
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
COPY --from=panel /panel/dist /app/frontend/dist
RUN useradd --create-home app && mkdir /data && chown app /data
USER app
ENV DATABASE_URL=sqlite:////data/triaje.db
EXPOSE 8000
HEALTHCHECK --interval=5s --timeout=3s --retries=10 \
  CMD python -c "import os, urllib.request; urllib.request.urlopen('http://localhost:%s/api/health' % os.environ.get('PORT', '8000'))"
# Render fija PORT; en local queda en 8000.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
