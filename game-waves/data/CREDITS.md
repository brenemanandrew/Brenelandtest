# Data credits

- `enable1.txt`: ENABLE word list (Enhanced North American Benchmark Lexicon), public domain. Used by Word Weave.
- `blocklist-ldnoobw-en.txt`: "List of Dirty, Naughty, Obscene, and Otherwise Bad Words" (English), by Shutterstock and
  contributors, CC BY 4.0, https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words. Word Weave drops
  these words (and their -s / -es plurals) from its word list.

Word Weave's packed list `server/lib/table-games/word-weave-words.js` is built from both by `tools/word-weave-build-words.mjs`.
