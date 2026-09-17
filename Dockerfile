# Base images come from registry.access.redhat.com, NOT docker.io: the ocpv2
# cluster's egress resets connections to registry-1.docker.io, so `node:22-alpine`
# cannot be pulled by the build pods. The Red Hat registry is reachable and needs
# no credentials. `:1` is the floating Node 22 tag (there is no `latest`).
#
# ---- deps ----
FROM registry.access.redhat.com/ubi9/nodejs-22:1 AS deps
USER 0
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ---- build ----
# This stage is also the `migrator` image (it keeps the source, node_modules and
# tsx, which db:migrate / db:seed need) — see openshift/11-buildconfigs.yaml.
FROM registry.access.redhat.com/ubi9/nodejs-22:1 AS build
USER 0
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- runtime (Next standalone) ----
FROM registry.access.redhat.com/ubi9/nodejs-22-minimal:1 AS runner
USER 0
WORKDIR /app
# HOSTNAME: Next's standalone server binds to $HOSTNAME. Kubernetes sets
# HOSTNAME to the pod name, so without this it never listens on 0.0.0.0 and
# every probe fails. The Deployment sets it again explicitly (runtime env wins).
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# OpenShift's restricted-v2 SCC runs the container as an arbitrary UID whose
# group is 0. Group-own everything and mirror user perms onto the group so that
# UID can execute and write Next's cache.
RUN mkdir -p .next/cache \
 && chgrp -R 0 /app \
 && chmod -R g=u /app
USER 1001
EXPOSE 3000
CMD ["node", "server.js"]
