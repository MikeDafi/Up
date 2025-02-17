export const backoff = (
    fn,
    maxRetries = 3,
    initialDelay = 1000, // in milliseconds
    timeout = 10000 // total timeout in milliseconds
) => {
  return async (...args) => {
    let attempts = 0;
    const startTime = Date.now();

    while (attempts < maxRetries) {
      try {
        return await fn(...args);
      } catch (error) {
        attempts++;
        const elapsedTime = Date.now() - startTime;

        if (attempts >= maxRetries || elapsedTime > timeout) {
          console.error(`Max retries or timeout reached after ${elapsedTime}ms.`);
          throw error;
        }

        const delay = Math.min(initialDelay * 2 ** (attempts - 1), timeout - elapsedTime); // Ensure delay fits within timeout
        console.warn(
            `Retrying... Attempt ${attempts} of ${maxRetries} after ${delay}ms. Elapsed: ${elapsedTime}ms`
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw new Error('Retry failed: Exceeded maximum retries or timeout');
  };
};

export const handleResponse = async (response, actionDescription = "Request failed") => {
  if (!response.ok) {
    let errorDetails;
    try {
      // Attempt to parse JSON error details if available
      errorDetails = await response.json();
    } catch {
      errorDetails = await response.text(); // Fallback to plain text
    }

    const errorMessage = `${actionDescription}. Status: ${response.status} ${response.statusText}. ${
        errorDetails ? `Details: ${JSON.stringify(errorDetails)}` : "No additional details available."
    }`;

    throw new Error(errorMessage);
  }
  return response;
};

export const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};



// Monkey patch global objects for debugging purposes
// const originalSetTimeout = global.setTimeout;
// global.setTimeout = (fn, delay, ...args) => {
//   console.log(`setTimeout called: ${delay}ms`, fn, args);
//   return originalSetTimeout(fn, delay, ...args);
// };
//
// const originalFetch = global.fetch;
// global.fetch = async (...args) => {
//   console.log('Fetch called with args:', args);
//   const result = await originalFetch(...args);
//   console.log('Fetch resolved with args:', args);
//   return result;
// };