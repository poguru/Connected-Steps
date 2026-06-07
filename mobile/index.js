// URL polyfill must be the very first import — required by @supabase/supabase-js
// in React Native before the native bridge is available.
import "react-native-url-polyfill/auto";

import { registerRootComponent } from "expo";
import App from "./App";

registerRootComponent(App);
