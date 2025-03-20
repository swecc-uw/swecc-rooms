function parseDate(dateString) {
  if (dateString instanceof Date) {
    return dateString;
  }
  return new Date(dateString);
}

function formatDateForAPI(date, includeTime = true) {
  const parsedDate = parseDate(date);
  
  if (includeTime) {
    return parsedDate.toISOString();
  } else {
    return parsedDate.toISOString().split('T')[0];
  }
}

function formatDateForDisplay(date, includeTime = false) {
  const parsedDate = parseDate(date);
  
  const options = {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  };
  
  if (includeTime) {
    options.hour = '2-digit';
    options.minute = '2-digit';
  }
  
  return parsedDate.toLocaleDateString(undefined, options);
}

function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    return parts.pop().split(';').shift();
  }
  return '';
}

function log(...args) {
  if (IS_DEV) {
    console.log(...args);
  }
}