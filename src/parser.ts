const MAX_REFERENCES = 3;
const MAX_NAME_LENGTH = 100;

export function extractReferences(content: string): string[] {
  const seen = new Set<string>();
  const references: string[] = [];
  let depth = 0;
  let start = -1;
  let nested = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (character === "[") {
      if (depth === 0) {
        start = index + 1;
        nested = false;
      } else {
        nested = true;
      }
      depth += 1;
      continue;
    }
    if (character !== "]" || depth === 0) {
      continue;
    }

    depth -= 1;
    if (depth !== 0 || nested || start === -1) {
      continue;
    }

    const name = content.slice(start, index).trim();
    start = -1;
    if (
      name.length < 2 ||
      name.length > MAX_NAME_LENGTH ||
      name.includes("\n") ||
      name.includes("\r")
    ) {
      continue;
    }

    const key = name.toLocaleLowerCase("en-US");
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    references.push(name);
    if (references.length === MAX_REFERENCES) {
      break;
    }
  }

  return references;
}
