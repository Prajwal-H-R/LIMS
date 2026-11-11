# --- Final Stage ---
# Switch from bookworm to alpine
FROM nginxinc/nginx-unprivileged:1.27-alpine

USER root

# Alpine uses apk instead of apt-get
RUN apk update && apk upgrade && rm -rf /var/cache/apk/*

RUN rm -f /etc/nginx/conf.d/default.conf && \
    cat > /etc/nginx/conf.d/default.conf <<'EOF'
server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

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

    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
USER nginx
CMD ["nginx", "-g", "daemon off;"]