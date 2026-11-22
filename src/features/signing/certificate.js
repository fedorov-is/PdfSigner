export function ownerName(subject, unavailable = 'Owner name unavailable') {
  const attributes = new Map();
  for (const match of subject.matchAll(
    /(?:^|,\s*)([\w.]+)\s*=\s*("(?:[^"]|"")*"|(?:\\.|[^,])*)/g,
  )) {
    attributes.set(
      match[1].toUpperCase(),
      match[2]
        .trim()
        .replace(/^"|"$/g, '')
        .replace(/""/g, '"')
        .replace(/\\(.)/g, '$1'),
    );
  }
  const personal = [
    attributes.get('SN') ?? attributes.get('SURNAME'),
    attributes.get('G') ?? attributes.get('GIVENNAME'),
  ]
    .filter(Boolean)
    .join(' ');
  return (
    personal ||
    attributes.get('CN') ||
    (attributes.size ? unavailable : subject)
  );
}
