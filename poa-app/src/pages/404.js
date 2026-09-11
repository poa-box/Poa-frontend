// pages/404.js
import React from "react";

const Custom404 = () => <h1>404 - Page Not Found</h1>;
Custom404.seo = {
  title: 'Page not found | Poa',
  description: 'This page could not be found. Explore Poa and its documentation from the homepage.',
  path: '/404',
  noIndex: true,
};

export default Custom404;
