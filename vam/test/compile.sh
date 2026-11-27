#!/bin/bash
# Compile-checks the Brene VaM plugin against test/VamStubs.cs (needs mono's mcs: apt-get install mono-mcs).
cd "$(dirname "$0")/.." || exit 1
# VaM's plugin checker refuses some enumerators (Dictionary .Values seen on Andrew's VaM 1.22): loop over a List copy instead
if grep -nE "foreach *\([^)]* in [A-Za-z_.]*\.(Values|Keys)\)|foreach *\(KeyValuePair" Custom/Scripts/Brene/*.cs; then echo "VaM checker: loop over new List<...>(dict.Values) instead (lines above)"; exit 1; fi
mcs -langversion:5 -target:library -nowarn:0618 -out:/tmp/brene-check.dll test/VamStubs.cs $(sed 's#^#Custom/Scripts/Brene/#' Custom/Scripts/Brene/Brene.cslist) && echo "compile ok (C# 5, against stand-ins)"
