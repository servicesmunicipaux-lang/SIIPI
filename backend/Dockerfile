# --------------------------------------------------------------------------
# Image de production de l'API SIIPI
# Build reproductible (npm ci sur le lockfile) et exécution sans privilèges.
# --------------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# Les dépendances d'abord : cette couche n'est reconstruite que si le
# lockfile change, ce qui rend les rebuilds de code quasi instantanés.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY seed ./seed
RUN npm run build

# --------------------------------------------------------------------------
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

# tsc compile src/ et seed/ avec rootDir '.', donc le code s'exécute depuis
# dist/src et dist/seed. Les fichiers lus à l'exécution doivent suivre :
#   dist/src/migrate.js  lit  ../migrations   -> /app/dist/migrations
#   dist/seed/seed.js    lit  ./data          -> /app/dist/seed/data
COPY migrations ./dist/migrations
COPY seed/data ./dist/seed/data

# Le conteneur ne tourne pas en root (l'image node fournit l'utilisateur 'node').
USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/src/index.js"]
