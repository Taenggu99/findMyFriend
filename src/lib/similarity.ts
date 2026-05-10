type MatchTarget = {
  category?: string | null;
  breed?: string | null;
  region?: string | null;
  gender?: string | null;
  neutered?: string | null;
  featureKeywords?: string | null;
};

type AnimalLike = {
  category: string;
  breed: string;
  foundRegion: string;
  gender: string;
  features: string;
};

const synonymGroups = [
  ["갈색", "브라운", "밤색"],
  ["빨간", "붉은", "레드"],
  ["목줄", "목걸이", "하네스"],
  ["푸들", "토이푸들", "미니푸들"],
  ["겁많음", "소심", "경계"]
];

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

export function splitKeywords(value?: string | null) {
  if (!value) {
    return [];
  }

  return value
    .split(/\s+/)
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

function sameOrIncludes(left?: string | null, right?: string | null) {
  if (!left || !right) {
    return false;
  }

  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);

  return normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft);
}

function areSimilarWords(left: string, right: string) {
  if (sameOrIncludes(left, right)) {
    return true;
  }

  return synonymGroups.some((group) => group.includes(left) && group.includes(right));
}

export function calculateFeatureSimilarity(inputKeywords: string[], features: string) {
  if (inputKeywords.length === 0) {
    return 1;
  }

  const featureKeywords = splitKeywords(features);
  if (featureKeywords.length === 0) {
    return 0;
  }

  const matched = inputKeywords.filter((keyword) =>
    featureKeywords.some((feature) => areSimilarWords(normalize(keyword), normalize(feature)))
  );

  return matched.length / inputKeywords.length;
}

/** 카테고리 일치 10점, 품종 30점, 지역 15, 성별 10, 특징 35 = 100 */
export function calculateMatchScore(target: MatchTarget, animal: AnimalLike) {
  const categoryOk = !target.category || animal.category === target.category;

  const categoryScore = !target.category ? 10 : animal.category === target.category ? 10 : 0;

  let breedScore = 0;
  if (target.breed) {
    breedScore = categoryOk && sameOrIncludes(animal.breed, target.breed) ? 30 : 0;
  } else {
    breedScore = categoryOk ? 30 : 0;
  }

  const regionScore = target.region && sameOrIncludes(animal.foundRegion, target.region) ? 15 : 0;
  const genderScore = target.gender && animal.gender === target.gender ? 10 : 0;
  const featureScore = Math.round(
    calculateFeatureSimilarity(splitKeywords(target.featureKeywords), animal.features) * 35
  );

  return categoryScore + breedScore + regionScore + genderScore + featureScore;
}
