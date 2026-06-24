from typing import List, Dict, Tuple, Any, Optional, TypedDict, Set

class UserSkill(TypedDict):
    name: str
    strength: float


class CanonicalSkill(TypedDict, total=False):
    id: str
    name: str
    aliases: List[str]
    keywords: List[str]
    prerequisites: List[str]


class IndexedCanonicalSkill(TypedDict):
    id: str
    name: str
    name_norm: str
    aliases: List[str]
    keywords: List[str]
    prerequisites: List[str]


class MappingResult(TypedDict):
    mapped: List[Dict[str, Any]]
    ignored: List[Dict[str, Any]]



def normalise_text(text: str) -> str:
    text = text.lower()
    cleaned: list[str] = []

    for char in text:
        if char.isalnum() or char.isspace():
            cleaned += char
        
    return "".join(cleaned)


# normalizes the canonical text (removes upper case, punctuation, etc.), returns new class with extra normalized attributes
def build_canonical_index(
    canonical_skills: List[CanonicalSkill]
) -> List[IndexedCanonicalSkill]:
    
    index: List[IndexedCanonicalSkill] = []

    for skill in canonical_skills:
        entry: IndexedCanonicalSkill = {
            "id": skill["id"],
            "name": skill["name"],
            "name_norm": normalise_text(skill["name"]),
            "aliases": [normalise_text(a) for a in skill.get("aliases", [])],
            "keywords": [normalise_text(k) for k in skill.get("keywords", [])],
            "prerequisites": skill.get("prerequisites", [])
        }
        index.append(entry)

    return index
