#!/usr/bin/env bash
# Sourced by eval-acceptance.sh and check-roux-way.sh: Postgres and Mailpit for scoring a run, in
# containers of their own (roux-eval-postgres, roux-eval-mailpit), started once and kept, on ports
# of their own, so nothing on this machine's usual ports (5432, 8025, 8080) is touched.
#
#   eval_services              start them if they are not running
#   eval_database <name>       a fresh, empty database: prints its URL
EVAL_PG_PORT=57240
EVAL_SMTP_PORT=57241
EVAL_MAILPIT_PORT=57242

eval_container() {
  local name="$1"
  shift
  if [ -z "$(docker ps -q -f "name=^$name\$")" ]; then
    docker rm -f "$name" >/dev/null 2>&1 || true
    docker run -d --name "$name" "$@" >/dev/null
  fi
}

eval_services() {
  eval_container roux-eval-postgres -e POSTGRES_USER=app -e POSTGRES_PASSWORD=app -e POSTGRES_DB=app \
    -p "127.0.0.1:$EVAL_PG_PORT:5432" postgres:18
  eval_container roux-eval-mailpit -p "127.0.0.1:$EVAL_SMTP_PORT:1025" \
    -p "127.0.0.1:$EVAL_MAILPIT_PORT:8025" axllent/mailpit:v1.34.0
  local _
  for _ in $(seq 1 30); do
    docker exec roux-eval-postgres pg_isready -U app >/dev/null 2>&1 && return 0
    sleep 1
  done
  echo "eval-services: roux-eval-postgres did not become ready" >&2
  return 1
}

eval_database() {
  docker exec roux-eval-postgres sh -c "dropdb -U app --if-exists $1 && createdb -U app $1" >&2
  echo "postgres://app:app@localhost:$EVAL_PG_PORT/$1"
}
