#!/usr/bin/env python3
"""Separate read-only smoke check of shipped data; never downloads or rebuilds."""
import gzip
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1] / 'data/webster'
files = sorted(root.glob('*.json.gz'))
assert len(files) == 27, 'expected all letter buckets and other'
entries = {}
for path in files:
    bucket = json.loads(gzip.decompress(path.read_bytes()).decode('utf-8'))
    for key, entry in bucket.items():
        assert isinstance(entry.get('pr'), str), (path.name, key)
        assert any(group[1] for group in entry['pos']), (path.name, key)
    entries.update(bucket)
for word in ['abase', 'apple', 'hello', 'world', 'dictionary', 'run', 'set', 'cat',
             'dog', 'house', 'water', 'book', 'go', 'see', 'quite', 'the', 'noun',
             'verb', 'running', 'went']:
    assert word in entries, word
for word in ['abase', 'apple', 'run', 'set', 'cat', 'house', 'go', 'see']:
    assert entries[word]['pr'], 'pronunciation lost for ' + word
print('DATA_SMOKE_PASS: 27 buckets, 20 known words, 8 pronunciations')
