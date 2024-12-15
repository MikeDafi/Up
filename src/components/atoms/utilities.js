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