FIGURES := algorithm-map algorithm-get algorithm-shift pipeline-get context-evolution

all: $(addsuffix .svg,$(FIGURES))

%.dvi: %.tex
	latexmk -dvi -interaction=nonstopmode $<

%.svg: %.dvi
	dvisvgm --no-fonts --exact $< -o $@

clean:
	latexmk -C
	rm -f *.svg

.PHONY: all clean
