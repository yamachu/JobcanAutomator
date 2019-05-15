DIST = dist

help:
	@more Makefile

.PHONY: help clean

build-development:
build-production:

build-%:
	npx webpack --mode='$*'
	@npx cpx './public/**/*' $(DIST)

watch:
	npx webpack --mode='development' --watch

clean:
	rm -r $(DIST)
