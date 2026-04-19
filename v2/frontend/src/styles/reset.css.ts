import { globalStyle } from '@vanilla-extract/css';

globalStyle('*, *::before, *::after', {
  boxSizing: 'border-box',
  margin: 0,
  padding: 0,
});

globalStyle('html, body, #root', {
  height: '100%',
  overflow: 'hidden',
});

globalStyle('::selection', {
  backgroundColor: 'rgba(124, 58, 237, 0.3)',
  color: '#e2e8f0',
});

globalStyle('::-webkit-scrollbar', {
  width: '6px',
  height: '6px',
});

globalStyle('::-webkit-scrollbar-track', {
  background: 'transparent',
});

globalStyle('::-webkit-scrollbar-thumb', {
  background: 'rgba(124, 58, 237, 0.3)',
  borderRadius: '3px',
});

globalStyle('::-webkit-scrollbar-thumb:hover', {
  background: 'rgba(124, 58, 237, 0.5)',
});
