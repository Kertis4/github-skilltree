# Loads the json files output from the parsers that read the repo. Outputs the json as dicts and lists
import json

def read_file(file) -> dict[str, str]:
    data = {}
    with open(file, 'r') as f:
        data = json.load(file)

    return data
