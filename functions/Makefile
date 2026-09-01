build-ApiFunction:
	npm ci
	npm run build
	cp -r lib "$(ARTIFACTS_DIR)/lib"
	cp package.json package-lock.json "$(ARTIFACTS_DIR)/"
	cd "$(ARTIFACTS_DIR)" && npm ci --omit=dev
