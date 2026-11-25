// Public web config of the Firebase project "vilni-pdr". These values are not
// secrets: they identify the project to the browser SDK and are visible in the
// built site anyway. Access to data is guarded by Firestore security rules,
// and the API key should be restricted to the site's domain in Google Cloud.
// Analytics (measurementId) is deliberately left out: the app sends no analytics.
export const firebaseConfig = {
  apiKey: 'AIzaSyALMV-gYQPd1St1WCC_OdAfyshJEOoUquA',
  authDomain: 'vilni-pdr.firebaseapp.com',
  projectId: 'vilni-pdr',
  storageBucket: 'vilni-pdr.firebasestorage.app',
  messagingSenderId: '544247175562',
  appId: '1:544247175562:web:3e35bccf2a36d3cf735073',
} as const;
