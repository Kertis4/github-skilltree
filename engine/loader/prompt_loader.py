# Turn user prompt into canonical set of skills

# Removes upper case and punctuation, returns list of words
def standardize_text(prompt) -> list[str]:
    prompt = prompt.lower()
    punctuation = set(['.', ',', '!', '"', '(', ')', '?', '*', '/', '#']) # not an extensive list
    letter_array = []

    for letter in prompt:
        if letter not in punctuation:
            letter_array.append(letter)

    no_punct_string = "".join(letter_array)
    string_list = no_punct_string.strip().split(" ")

    return string_list


# turns list of prompt words into list of every skill name that appears
# prompt_list - List of words from the prompt, all lowercase
# alias_dict - dictionary of all aliases for all skills e.g. {skill_alias: skill}
# skills_set - set of all canonical skills
# keyword_dict - dictionary of every keyword for each canonical skill e.g. {keyword: skill}
def convert_prompt_to_skills(prompt_list: list[str], alias_dict: dict[str, str], skills_set: set[str], keyword_dict: dict[str, str]) -> list[str]:

    canonical_skills_set = []
    skills_found = []

    for word in prompt_list:
        if word in alias_dict:
            skills_found.append(alias_dict[word])
        if word in skills_set:
            skills_found.append(word)
        if word in keyword_dict:
            skills_found.append(keyword_dict[word])

        if len(skills_found) != 0:

            canonical_skills_set += canonical_skills_set + skills_found

    canonical_skills = list(set(canonical_skills_set))    

    return canonical_skills

# Takes the converted canonical skills list from the prompt and narrows it down to the most relevant skills
# prompt_list - The original list of words in the prompt
# skills_list - The broad list of skills to be narrowed down
def narrow_down_skills(prompt_list: list[str], skills_list: list[str]) -> list[str]:
    return skills_list

if __name__ == "__main__":
    skills = ["backend", "frontend", "full stack", "databases"]
    aliases = {
        "structure": "backend",
        "ui": "frontend",
        "everything": "full stack",
        "storage": "databases"
    }
    keywords = {
        "back": "backend",
        "front": "frontend",
        "all": "full stack",
        "persistence": "databases"
    }
    prompt = "I want to learn about how everything works, including storage. databases and full stack, backend"
    prompt_list = standardize_text(prompt)
    canonical_skills = convert_prompt_to_skills(prompt_list, aliases, skills, keywords)
    canonical_skills = narrow_down_skills(canonical_skills)
    print(canonical_skills)