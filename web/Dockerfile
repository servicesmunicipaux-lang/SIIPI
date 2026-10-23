# --------------------------------------------------------------------------
# Image de production du front de SIIPI (chantier P, lot P4).
#
# Le front est construit ici (npm run build : typage, puis Vite), et servi par
# Caddy, qui porte aussi le HTTPS et relaie /api vers l'API. Sa configuration
# (backend/exploitation/frontal/Caddyfile) est montée par le compose de
# production : la campagne `proxy-https` éprouve ce même fichier.
#
# Le front appelle /api par défaut (src/lib/api.ts) : aucune adresse n'est
# figée à la construction, la même image sert tous les serveurs.
# --------------------------------------------------------------------------
FROM node:22-alpine AS construction
WORKDIR /web
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# Caddy 2.11 : la version que la campagne éprouve (paquet Alpine).
FROM caddy:2.11-alpine
COPY --from=construction /web/dist /srv
