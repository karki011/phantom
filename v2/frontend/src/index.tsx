import { render } from 'solid-js/web';
import { App } from './app';
import './styles/reset.css';
import 'hack-font/build/web/hack.css';

render(() => <App />, document.getElementById('root')!);
