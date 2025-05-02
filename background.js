// background.js - Service Worker

/**
 * Function to extract image URLs from the current page context.
 * This function will be injected into each tab.
 * @returns {string[]} An array of image source URLs found on the page.
 */
function scrapeImageUrls() {
  // Select all image elements on the page
  const images = document.querySelectorAll('img');
  const urls = [];
  // Iterate over the NodeList of images
  images.forEach(img => {
    // Get the source URL
    const src = img.src;
    // Basic validation: ensure src exists and is not a data URI (optional)
    if (src && !src.startsWith('data:')) {
      // Resolve relative URLs to absolute URLs
      try {
        const absoluteUrl = new URL(src, document.baseURI).href;
        urls.push(absoluteUrl);
      } catch (e) {
        // Ignore invalid URLs
        console.warn(`Skipping invalid image URL: ${src}`, e);
      }
    }
  });
  // Return the array of valid, absolute image URLs
  return urls;
}

/**
 * Handles the click event on the extension's action icon.
 * @param {chrome.tabs.Tab} currentTab - The tab where the icon was clicked (not directly used here as we query all tabs).
 */
async function handleActionClick(currentTab) {
  console.log("Action clicked. Starting image download process...");

  try {
    // 1. Get all tabs in the current window
    const tabs = await chrome.tabs.query({ currentWindow: true });
    console.log(`Found ${tabs.length} tabs in the current window.`);

    let totalImagesFound = 0;
    let downloadPromises = []; // Store promises for download operations

    // 2. Iterate through each tab
    for (const tab of tabs) {
      // Skip tabs that cannot be scripted (e.g., chrome:// URLs, internal pages)
      if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('about:')) {
        console.log(`Skipping tab ${tab.id} (URL: ${tab.url || 'N/A'})`);
        continue;
      }

      console.log(`Processing tab ${tab.id} (URL: ${tab.url})`);

      try {
        // 3. Inject the content script into the tab
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: scrapeImageUrls // Inject the function directly
        });

        // Check if injection was successful and returned results
        if (results && results.length > 0 && results[0].result) {
          const imageUrls = results[0].result;
          console.log(`Found ${imageUrls.length} images in tab ${tab.id}`);
          totalImagesFound += imageUrls.length;

          // 4. Initiate downloads for each image URL found
          imageUrls.forEach(imageUrl => {
            console.log(`Attempting to download: ${imageUrl}`);
            // Add the download promise to the array
            const downloadPromise = chrome.downloads.download({
                url: imageUrl
                // Optional: Specify a filename or save directory
                // filename: 'downloaded_images/' + imageUrl.substring(imageUrl.lastIndexOf('/') + 1)
              })
              .then(downloadId => {
                if (downloadId) {
                  console.log(`Successfully initiated download for ${imageUrl} (ID: ${downloadId})`);
                } else {
                  // This case might indicate an immediate failure or cancellation
                   console.warn(`Download initiation might have failed for ${imageUrl}. No download ID returned.`);
                }
              })
              .catch(error => {
                // Handle potential errors during download initiation (e.g., network issues, invalid URL after resolution)
                console.error(`Error initiating download for ${imageUrl}:`, error.message || error);
              });
            downloadPromises.push(downloadPromise);
          });
        } else if (results && results.length > 0 && results[0].error) {
           console.error(`Error executing script in tab ${tab.id}:`, results[0].error);
        } else {
           console.log(`No images found or script injection failed in tab ${tab.id}. Result:`, results);
        }

      } catch (error) {
        // Handle errors during script injection (e.g., permission issues, page not accessible)
        console.error(`Failed to execute script in tab ${tab.id} (URL: ${tab.url}):`, error.message || error);
      }
    } // End of tab loop

    console.log(`Finished processing all tabs. Found a total of ${totalImagesFound} images.`);

    // Optional: Wait for all download initiations to complete (or fail)
    // Note: This only waits for the *initiation*, not the completion of the download itself.
    await Promise.allSettled(downloadPromises);
    console.log("All download initiation attempts have been processed.");

    // Optional: Notify the user (requires "notifications" permission in manifest)
    // chrome.notifications.create({
    //   type: 'basic',
    //   iconUrl: 'images/icon48.png', // Make sure you have this icon
    //   title: 'Image Download Started',
    //   message: `Initiated downloads for ${totalImagesFound} images found across tabs.`
    // });

  } catch (error) {
    // Handle errors during tab querying
    console.error("Error querying tabs:", error.message || error);
  }
}

// Add listener for the extension's action button click
chrome.action.onClicked.addListener(handleActionClick);

// Optional: Log when the service worker starts
console.log("Background service worker started.");
