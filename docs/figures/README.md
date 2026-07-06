# Figures

Typeset renderings of the normative pseudocode in `SPEC.md` (§5), plus future
diagrams. LaTeX sources are the canonical form for publication use; the
committed `.svg` files are their renderings for GitHub/editor viewing.

## Building

Requires a TeX distribution with `latexmk` and `dvisvgm` (glyphs are converted
to paths, so the SVGs have no font dependencies):

```bash
make        # renders every figure to .svg
make clean  # removes build artifacts and rendered SVGs
```

Regenerate the SVGs in the same change whenever a `.tex` source is edited.
