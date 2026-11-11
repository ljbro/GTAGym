"""Read data-only YAML; reject duplicate keys and non-JSON scalar values."""
import json
import sys
from pathlib import Path

import yaml


class UniqueLoader(yaml.SafeLoader):
    pass


def mapping(loader, node, deep=False):
    result = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if not isinstance(key, str) or key in result:
            raise ValueError(f"Non-string or duplicate YAML key: {key!r}")
        result[key] = loader.construct_object(value_node, deep=deep)
    return result


UniqueLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, mapping)

if __name__ == "__main__":
    value = yaml.load(Path(sys.argv[1]).read_text(encoding="utf-8"), Loader=UniqueLoader)
    print(json.dumps(value, ensure_ascii=False, allow_nan=False))
