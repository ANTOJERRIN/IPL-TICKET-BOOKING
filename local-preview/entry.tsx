import {createRoot} from 'react-dom/client';
import {Route} from '../sales-app/src/routes/index';

const Store = Route.component;
createRoot(document.getElementById('root')!).render(<Store/>);
