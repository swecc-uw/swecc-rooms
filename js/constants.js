const LOCAL_API_ENDPOINT = 'http://localhost';
const PROD_API_ENDPOINT = 'https://api.swecc.org';

const IS_DEV = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_BASE_URL = IS_DEV ? LOCAL_API_ENDPOINT : PROD_API_ENDPOINT;