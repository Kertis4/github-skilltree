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
LANGUAGE skills (resolved here from GitHub-linguist byte shares, deterministic):
    javascript, typescript, python, html-css
SOFT skills (the *gap set*, deferred to the LLM in ``worker.py``):
    oop, functional, async, error-handling

Every value here is derived from GitHub metadata only - reproducible and
explainable, with zero hallucination risk.
"""

from __future__ import annotations

# Canonical taxonomy for the analysis stage (matches the blob's config.taxonomy).
HARD_SKILLS = (
    "git", "docker", "ci", "iac", "testing", "typing", "documentation",
    "architecture", "sql",
)
# Programming-language skills, resolved deterministically from GitHub-linguist byte
# shares (no LLM, no file reads) - same provenance guarantees as the HARD skills.
LANGUAGE_SKILLS = ("javascript", "typescript", "python", "html-css")
# SOFT skills need code eyes (LLM). ``databases``/``orm`` are LLM-judged but also
# seeded deterministically from data-file signals (see ``seed_data_skills``).
SOFT_SKILLS = ("oop", "functional", "async", "error-handling", "databases", "orm")
TAXONOMY = HARD_SKILLS + LANGUAGE_SKILLS + SOFT_SKILLS

# GitHub-linguist language name (lower-cased) -> taxonomy language skill id. Several
# linguist languages roll up into one skill: Jupyter notebooks are essentially
# Python; HTML / CSS / preprocessors are one front-end markup skill.
_LANGUAGE_SKILL_MAP = {
    "javascript": "javascript",
    "jsx": "javascript",
    "typescript": "typescript",
    "tsx": "typescript",
    "python": "python",
    "jupyter notebook": "python",
    "html": "html-css",
    "css": "html-css",
    "scss": "html-css",
    "sass": "html-css",
    "less": "html-css",
}

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
    signals = digest.get("signals") or {}
    gaps = ["oop", "functional", "error-handling", "databases"]
    if langs & _ASYNC_LANGS:
        gaps.append("async")
    # Only ask about an ORM when there is a concrete persistence signal, to avoid
    # spending the token budget on repos with no database surface.
    if signals.get("hasDatabase") or signals.get("hasOrm"):
        gaps.append("orm")
    return gaps


def detect_hard_skills(digest: dict) -> list[dict]:
    """Resolve every HARD skill deterministically from the digest. Always returns
    one record per HARD skill (``present`` may be False)."""
    signals = digest.get("signals") or {}
    structure = digest.get("structure") or {}
    langs = repo_languages(digest)

    skills: list[dict] = []

    # --- git (every GitHub repository is version-controlled with Git) ---
    skills.append(
        _skill(
            "git",
            True,
            level="basic",
            evidence=[{"path": "(repo)", "observation": "GitHub repository (Git version control)"}],
            rationale="all GitHub repositories are tracked with Git",
        )
    )

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

    # --- sql (schema/query files + migration directories; deterministic) ---
    data_paths = _configs_by_category(digest, "data")
    sql_paths = [p for p in data_paths if p.lower().endswith(".sql") or "migrat" in p.lower()]
    skills.append(
        _skill(
            "sql",
            bool(signals.get("hasSql")) or bool(sql_paths),
            level="intermediate" if len(sql_paths) > 3 else ("basic" if sql_paths else "none"),
            evidence=[{"path": p, "observation": "SQL / migration file"} for p in sql_paths[:6]],
            rationale=f"{len(sql_paths)} SQL/migration file(s) detected" if sql_paths
            else "no SQL/migration files",
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


# Substrings in a data-category path that point to an ORM / data-mapper config.
_ORM_PATH_HINTS = ("prisma", "ormconfig", "sequelize", "knexfile", "alembic", "typeorm")


def seed_data_skills(digest: dict, skills: list[dict]) -> None:
    """Deterministically light up ``databases``/``orm`` from data-file signals.

    Persistence work often leaves file traces (``.sql`` schemas, ``migrations/``,
    Prisma/Sequelize/Alembic config) even when the database itself is gitignored.
    This seeds those skills as present so they register without an LLM pass, and
    *upgrades* an LLM 'absent' to present when the files clearly show otherwise -
    but never downgrades a skill the model already marked present. Mutates
    ``skills`` in place (appending records that are missing)."""
    signals = digest.get("signals") or {}
    data_paths = _configs_by_category(digest, "data")
    by_id = {s.get("skillId"): s for s in skills}

    def _light(skill_id: str, level: str, paths: list[str], rationale: str) -> None:
        evidence = [{"path": p, "observation": "database/SQL artifact"} for p in paths[:4]]
        rec = by_id.get(skill_id)
        if rec is None:
            rec = _skill(skill_id, True, level=level, evidence=evidence,
                         rationale=rationale, source="heuristic", confidence=1.0)
            skills.append(rec)
            by_id[skill_id] = rec
            return
        if rec.get("present"):
            return  # never downgrade a model 'present'
        rec["present"] = True
        rec["source"] = "heuristic"
        rec["confidence"] = 1.0
        if rec.get("level") in (None, "none"):
            rec["level"] = level
        if not rec.get("evidence"):
            rec["evidence"] = evidence
        rec["rationale"] = rationale

    if signals.get("hasDatabase") or signals.get("hasSql"):
        _light(
            "databases",
            "intermediate" if signals.get("hasSql") else "basic",
            data_paths,
            "SQL / migration / database files present in repo",
        )
    if signals.get("hasOrm"):
        orm_paths = [p for p in data_paths if any(h in p.lower() for h in _ORM_PATH_HINTS)]
        _light(
            "orm",
            "basic",
            orm_paths or data_paths,
            "ORM / data-mapper config present (Prisma/Sequelize/Alembic/...)",
        )


def _language_shares(digest: dict) -> dict[str, float]:
    """Summed byte-share per taxonomy language skill id for this repo (0..1)."""
    shares: dict[str, float] = {}
    primary = ((digest.get("primaryLanguage") or {}).get("name") or "").lower()
    for lang in digest.get("languages") or []:
        name = (lang.get("name") or "").lower()
        skill_id = _LANGUAGE_SKILL_MAP.get(name)
        if not skill_id:
            continue
        share = float(lang.get("share") or 0.0)
        # A primary language with no recorded share still counts as present.
        if share <= 0 and name == primary:
            share = 0.01
        shares[skill_id] = shares.get(skill_id, 0.0) + share
    return shares


def detect_language_skills(digest: dict) -> list[dict]:
    """Resolve programming-language skills deterministically from the repo's
    GitHub-linguist language breakdown. Always returns one record per
    LANGUAGE_SKILL (``present`` may be False). Level scales with byte share so a
    repo dominated by a language reads as deeper command of it."""
    shares = _language_shares(digest)
    skills: list[dict] = []
    for skill_id in LANGUAGE_SKILLS:
        share = shares.get(skill_id, 0.0)
        present = share >= 0.05
        if not present:
            level = "none"
        elif share >= 0.5:
            level = "advanced"
        elif share >= 0.2:
            level = "intermediate"
        else:
            level = "basic"
        pct = round(share * 100)
        skills.append(
            _skill(
                skill_id,
                present,
                level=level,
                evidence=[{"path": "(languages)", "observation": f"{pct}% of repo code"}]
                if present else [],
                rationale=f"{pct}% of repo bytes by GitHub linguist"
                if present else "not a significant language in this repo",
            )
        )
    return skills
