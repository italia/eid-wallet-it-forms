# Static site (HTML/CSS/JS). Use a local HTTP server so fetch() can load schema and example JSON.

PORT ?= 8080

.DEFAULT_GOAL := serve

.PHONY: build serve local lint help

help:
	@echo "Targets:"
	@echo "  make / make serve  – build then http://127.0.0.1:$(PORT)/"
	@echo "  make build         – verify files and JSON only"
	@echo "  make lint          – ESLint (JS) + html-validate (richiede npm install)"
	@echo "  make local         – serve and open browser (xdg-open)"
	@echo "  PORT=9000 make     – custom port"

lint:
	npm run lint
	npm run lint:html

build:
	@test -f index.html && test -f form.html
	@test -f assets/css/style.css
	@test -f assets/favicon.ico
	@test -f assets/js/storage.js && test -f assets/js/csv-utils.js && test -f assets/js/form-utils.js && test -f assets/js/je-longtext-fit.js && test -f assets/js/je-array-control-card.js
	@test -f assets/js/resource-errors.js
	@test -f assets/js/site-chrome.js
	@test -f assets/vendor/ajv2020.min.js
	@test -f webforms-manifest.json
	python3 -c "import json; m=json.load(open('webforms-manifest.json')); assert m.get('webforms'); assert all(w.get('id') and w.get('schemaUrl') and w.get('dataUrl') for w in m['webforms'])"
	@echo "build: OK"

serve: build
	@echo "Serving at http://127.0.0.1:$(PORT)/  (Ctrl+C to stop)"
	python3 -m http.server $(PORT)

local: build
	@bash -c 'set -e; python3 -m http.server $(PORT) & pid=$$!; sleep 0.8; command -v xdg-open >/dev/null && xdg-open "http://127.0.0.1:$(PORT)/" || true; wait $$pid'
