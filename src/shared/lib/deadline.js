export function deadline(operation, milliseconds = 120000) {
  let timer;
  return Promise.race([
    Promise.resolve().then(operation),
    new Promise((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(
              'CryptoPro timed out. Close any pending native dialog, check the token and retry.',
            ),
          ),
        milliseconds,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}
