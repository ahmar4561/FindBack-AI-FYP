def normalize(value):
    if value is None:
        return ""
    return str(value).strip().lower()


def calculate_attribute_score(missing, found):
    score = 0
    total_weight = 0

    # Gender — 25%
    total_weight += 25
    if normalize(missing.get("gender")) == normalize(found.get("gender")):
        score += 25

    # Approximate Age — 25%
    total_weight += 25

    missing_age = missing.get("approximate_age")
    found_age = found.get("approximate_age")

    if missing_age is not None and found_age is not None:
        age_difference = abs(missing_age - found_age)

        if age_difference <= 2:
            score += 25
        elif age_difference <= 5:
            score += 15
        elif age_difference <= 10:
            score += 5

    # Hair — 15%
    total_weight += 15
    if (
        normalize(missing.get("hair"))
        and normalize(missing.get("hair")) == normalize(found.get("hair"))
    ):
        score += 15

    # Eye Color — 15%
    total_weight += 15
    if (
        normalize(missing.get("eye_color"))
        and normalize(missing.get("eye_color")) == normalize(found.get("eye_color"))
    ):
        score += 15

    # Clothing — 10%
    total_weight += 10
    missing_clothing = normalize(missing.get("clothing"))
    found_clothing = normalize(found.get("clothing"))

    if missing_clothing and found_clothing:
        if (
            missing_clothing in found_clothing
            or found_clothing in missing_clothing
        ):
            score += 10

    # Distinguishing Marks — 10%
    total_weight += 10
    missing_marks = normalize(missing.get("distinguishing_marks"))
    found_marks = normalize(found.get("distinguishing_marks"))

    if missing_marks and found_marks:
        if missing_marks in found_marks or found_marks in missing_marks:
            score += 10

    return round((score / total_weight) * 100, 2)