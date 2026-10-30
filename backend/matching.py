
def normalize(value):
    if value is None:
        return ""
    return str(value).strip().lower()


def calculate_attribute_score(missing, found):
    """
    Existing weighted attribute score.
    Returns 0-100.

    This score is a heuristic, not an identity
    probability.
    """

    score = 0
    total_weight = 100

    # Gender - 25%
    if (
        normalize(missing.get("gender"))
        and normalize(missing.get("gender"))
        == normalize(found.get("gender"))
    ):
        score += 25

    # Approximate Age - 25%
    missing_age = missing.get("approximate_age")
    found_age = found.get("approximate_age")

    if missing_age is not None and found_age is not None:
        age_difference = abs(
            float(missing_age) - float(found_age)
        )

        if age_difference <= 2:
            score += 25
        elif age_difference <= 5:
            score += 15
        elif age_difference <= 10:
            score += 5

    # Hair - 15%
    if (
        normalize(missing.get("hair"))
        and normalize(missing.get("hair"))
        == normalize(found.get("hair"))
    ):
        score += 15

    # Eye Color - 15%
    if (
        normalize(missing.get("eye_color"))
        and normalize(missing.get("eye_color"))
        == normalize(found.get("eye_color"))
    ):
        score += 15

    # Clothing - 10%
    missing_clothing = normalize(
        missing.get("clothing")
    )
    found_clothing = normalize(
        found.get("clothing")
    )

    if missing_clothing and found_clothing:
        if (
            missing_clothing in found_clothing
            or found_clothing in missing_clothing
        ):
            score += 10

    # Distinguishing Marks - 10%
    missing_marks = normalize(
        missing.get("distinguishing_marks")
    )
    found_marks = normalize(
        found.get("distinguishing_marks")
    )

    if missing_marks and found_marks:
        if (
            missing_marks in found_marks
            or found_marks in missing_marks
        ):
            score += 10

    return round(
        (score / total_weight) * 100,
        2
    )


def get_attribute_completeness(missing, found):
    """
    Reports how many attribute comparisons
    are possible.

    Unknown values are not treated as
    confirmed mismatches.
    """

    fields = [
        "gender",
        "approximate_age",
        "hair",
        "eye_color",
        "clothing",
        "distinguishing_marks",
    ]

    available = []
    missing_fields = []

    for field in fields:
        missing_value = missing.get(field)
        found_value = found.get(field)

        if (
            missing_value is not None
            and found_value is not None
            and str(missing_value).strip()
            and str(found_value).strip()
        ):
            available.append(field)
        else:
            missing_fields.append(field)

    return {
        "comparable_fields": len(available),
        "total_fields": len(fields),
        "available_fields": available,
        "incomplete_fields": missing_fields,
    }


def get_match_warnings(missing, found):
    """
    Returns review warnings only.

    Warnings do not automatically reject
    or confirm an identity.
    """

    warnings = []

    missing_age = missing.get("approximate_age")
    found_age = found.get("approximate_age")

    if missing_age is not None and found_age is not None:
        age_difference = abs(
            float(missing_age) - float(found_age)
        )

        if age_difference > 10:
            warnings.append(
                "Large age difference between reports. "
                "Check report dates and age estimates."
            )

    missing_gender = normalize(
        missing.get("gender")
    )
    found_gender = normalize(
        found.get("gender")
    )

    if (
        missing_gender
        and found_gender
        and missing_gender != found_gender
        and missing_gender not in ("unknown", "other")
        and found_gender not in ("unknown", "other")
    ):
        warnings.append(
            "Reported gender differs. "
            "Check the original reports."
        )

    completeness = get_attribute_completeness(
        missing,
        found
    )

    if completeness["comparable_fields"] < 3:
        warnings.append(
            "Limited comparable attributes. "
            "Attribute score may be incomplete."
        )

    return warnings
