"""Layer 1 of skill extraction - deterministic heuristic detectors (NO LLM, NO file reads).

Most of the taxonomy is decidable from the cheap signals already present in the
analysis blob (``signals``, ``configs``, ``languages``, ``structure``). Resolving
those here means the LLM is only ever asked about the handful of "soft" paradigm
skills that genuinely require looking at source code - which is what keeps token
spend and hallucination risk low.

Skill split
-----------
HARD skills (resolved here, ``source="heuristic"``, ``confidence=1.0``):
    docker, ci, iac, testing, typing, documentation, architecture
SOFT skills (the *gap set*, deferred to the LLM in ``worker.py``):
    oop, functional, async, error-handling

Every value here is derived from GitHub metadata only - reproducible and
explainable, with zero hallucination risk.
"""

from __future__ import annotations

# Canonical taxonomy for the analysis stage (matches the blob's config.taxonomy).
HARD_SKILLS = ("docker", "ci", "iac", "testing", "typing", "documentation", "architecture")
SOFT_SKILLS = ("oop", "functional", "async", "error-handling")
TAXONOMY = HARD_SKILLS + SOFT_SKILLS

# Languages where OO / functional / error-handling idioms are meaningful to look for.
# Purely-markup / typesetting / data languages are excluded so we never spend an LLM
# call on a repo that is "code" only in the GitHub-linguist sense.
_CODE_LANGS = {
    "python", "jupyter notebook", "javascript", "typescript", "java", "c#", "c++",
    "c", "go", "rust", "ruby", "kotlin", "swift", "scala", "php", "dart", "elixir",
    "objective-c", "perl", "haskell", "clojure", "lua", "r", "julia",
}
# Subset of the above whose ecosystems have first-class async / concurrency.
_ASYNC_LANGS = {
    "python", "javascript", "typescript", "c#", "rust", "go", "kotlin", "dart",
    "elixir", "scala",
}
# Languages that imply static typing when they dominate a repo.
_TYPED_LANGS = {"typescript", "c#", "java", "go", "rust", "kotlin", "swift", "scala", "c++"}


def _configs_by_category(digest: dict, category: str) -> list[str]:
    """Return the paths of detected config files in a given category."""
    return [c["path"] for c in (digest.get("configs") or []) if c.get("category") == category]


def _skill(
    skill_id: str,
    present: bool,
    *,
    level: str,
    evidence: list[dict],
    rationale: str,
    source: str = "heuristic",
    confidence: float = 1.0,
) -> dict:
    """Build a normalized skill record (the shape the collated blob expects)."""
    return {
        "skillId": skill_id,
        "present": present,
        "source": source,
        "confidence": confidence,
        "level": level,
        "evidence": evidence,
        "rationale": rationale,
    }


def repo_languages(digest: dict) -> list[str]:
    """Lower-cased language names present in the repo, most code first."""
    return [(lang.get("name") or "").lower() for lang in (digest.get("languages") or [])]


def has_source_code(digest: dict) -> bool:
    """True if the repo contains a real programming language (not just docs/markup)."""
    return any(lang in _CODE_LANGS for lang in repo_languages(digest))


def plausible_gap_skills(digest: dict) -> list[str]:
    """Which SOFT skills are worth asking the LLM about for this repo.

    Filters out skills that cannot plausibly apply given the repo's languages, so
    we never burn a token budget asking about ``async`` in a repo with no
    async-capable language, or about paradigms in a docs-only repo.
    """
    langs = set(repo_languages(digest))
    if not (langs & _CODE_LANGS):
        return []
    gaps = ["oop", "functional", "error-handling"]
    if langs & _ASYNC_LANGS:
        gaps.append("async")
    return gaps


def detect_hard_skills(digest: dict) -> list[dict]:
    """Resolve every HARD skill deterministically from the digest. Always returns
    one record per HARD skill (``present`` may be False)."""
    signals = digest.get("signals") or {}
    structure = digest.get("structure") or {}
    langs = repo_languages(digest)

    skills: list[dict] = []

    # --- docker ---
    docker_paths = _configs_by_category(digest, "docker")
    has_compose = any("docker-compose" in p.lower() for p in docker_paths)
    skills.append(
        _skill(
            "docker",
            bool(signals.get("hasDocker")),
            level="intermediate" if has_compose else ("basic" if docker_paths else "none"),
            evidence=[{"path": p, "observation": "container definition"} for p in docker_paths],
            rationale="docker-compose present" if has_compose else "Dockerfile present"
            if docker_paths else "no container files detected",
        )
    )

    # --- ci ---
    ci_paths = _configs_by_category(digest, "ci")
    skills.append(
        _skill(
            "ci",
            bool(signals.get("hasCi")),
            level="intermediate" if len(ci_paths) > 1 else ("basic" if ci_paths else "none"),
            evidence=[{"path": p, "observation": "CI pipeline"} for p in ci_paths],
            rationale=f"{len(ci_paths)} CI config(s) detected" if ci_paths else "no CI config",
        )
    )

    # --- iac ---
    iac_paths = _configs_by_category(digest, "iac")
    skills.append(
        _skill(
            "iac",
            bool(signals.get("hasIac")),
            level="intermediate" if len(iac_paths) > 2 else ("basic" if iac_paths else "none"),
            evidence=[{"path": p, "observation": "infrastructure-as-code"} for p in iac_paths],
            rationale=f"{len(iac_paths)} IaC file(s) detected" if iac_paths else "no IaC files",
        )
    )

    # --- testing ---
    test_count = int(signals.get("testFileCount") or 0)
    if test_count == 0:
        test_level = "none"
    elif test_count <= 3:
        test_level = "basic"
    elif test_count <= 10:
        test_level = "intermediate"
    else:
        test_level = "advanced"
    skills.append(
        _skill(
            "testing",
            test_count > 0,
            level=test_level,
            evidence=[{"path": "(repo)", "observation": f"{test_count} test file(s)"}]
            if test_count else [],
            rationale=f"{test_count} test file(s) by path convention",
        )
    )

    # --- typing ---
    build_paths = _configs_by_category(digest, "build")
    lint_paths = _configs_by_category(digest, "lint")
    has_tsconfig = any("tsconfig" in p.lower() for p in build_paths)
    has_mypy = any(("mypy" in p.lower() or "flake8" in p.lower()) for p in lint_paths)
    primary = (digest.get("primaryLanguage") or {}).get("name", "") or ""
    typed_primary = primary.lower() in _TYPED_LANGS
    typing_present = has_tsconfig or has_mypy or typed_primary
    typing_evidence: list[dict] = []
    if has_tsconfig:
        typing_evidence += [{"path": p, "observation": "TypeScript config"} for p in build_paths if "tsconfig" in p.lower()]
    if has_mypy:
        typing_evidence += [{"path": p, "observation": "type checker config"} for p in lint_paths if ("mypy" in p.lower() or "flake8" in p.lower())]
    skills.append(
        _skill(
            "typing",
            typing_present,
            level="intermediate" if (has_tsconfig or has_mypy) and typed_primary
            else ("basic" if typing_present else "none"),
            evidence=typing_evidence
            or ([{"path": "(languages)", "observation": f"statically-typed primary language: {primary}"}] if typed_primary else []),
            rationale="type-checker/config and/or statically-typed primary language"
            if typing_present else "no static-typing signal",
        )
    )

    # --- documentation ---
    doc_count = int(signals.get("docFileCount") or 0)
    has_readme = bool(signals.get("hasReadme"))
    has_license = bool(signals.get("hasLicense"))
    doc_score = (1 if has_readme else 0) + (1 if has_license else 0) + min(doc_count, 10)
    if not has_readme and doc_count == 0:
        doc_level = "none"
    elif doc_score <= 2:
        doc_level = "basic"
    elif doc_score <= 6:
        doc_level = "intermediate"
    else:
        doc_level = "advanced"
    doc_evidence: list[dict] = []
    readme = digest.get("readme") or {}
    if readme.get("path"):
        doc_evidence.append({"path": readme["path"], "observation": "README"})
    skills.append(
        _skill(
            "documentation",
            has_readme or doc_count > 0,
            level=doc_level,
            evidence=doc_evidence,
            rationale=f"README={has_readme}, license={has_license}, {doc_count} doc file(s)",
        )
    )

    # --- architecture (structural approximation: layering + modularity) ---
    file_count = int(structure.get("fileCount") or 0)
    dir_count = int(structure.get("dirCount") or 0)
    max_depth = int(structure.get("maxDepth") or 0)
    top_dirs = structure.get("topDirs") or []
    is_code = any(lang in _CODE_LANGS for lang in langs)
    # A repo shows architectural structure when it is multi-directory, reasonably
    # deep, and spreads code across several top-level modules.
    layered = is_code and dir_count >= 5 and max_depth >= 2 and len(top_dirs) >= 2
    well_layered = is_code and dir_count >= 12 and max_depth >= 3 and len(top_dirs) >= 3
    skills.append(
        _skill(
            "architecture",
            layered,
            level="intermediate" if well_layered else ("basic" if layered else "none"),
            evidence=[{
                "path": "(structure)",
                "observation": f"{file_count} files / {dir_count} dirs / depth {max_depth} / "
                f"{len(top_dirs)} top-level modules",
            }] if layered else [],
            rationale="multi-module layered layout" if layered else "flat / single-module layout",
        )
    )

    return skills
