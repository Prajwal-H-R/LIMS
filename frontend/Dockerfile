FROM node:20-bullseye-slim AS build

WORKDIR /app

# Install dependencies first
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# Copy source
COPY frontend /app

# Build-time API base for Vite
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN npm run build


FROM nginx:1.27-alpine

# Clean default site config and add SPA + API proxy config
RUN rm -f /etc/nginx/conf.d/default.conf && \
    cat > /etc/nginx/conf.d/default.conf <<'EOF'
server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    # Proxy API requests to backend service
    location /api/ {
        proxy_pass http://backend:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]