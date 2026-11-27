#!/bin/bash
# Compile-checks the Brene VaM plugin against test/VamStubs.cs (needs mono's mcs: apt-get install mono-mcs).
cd "$(dirname "$0")/.." && mcs -langversion:5 -target:library -nowarn:0618 -out:/tmp/brene-check.dll test/VamStubs.cs $(sed 's#^#Custom/Scripts/Brene/#' Custom/Scripts/Brene/Brene.cslist) && echo "compile ok (C# 5, against stand-ins)"
