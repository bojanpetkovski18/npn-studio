package mk.nalogix.app;

import android.graphics.Color;
import android.view.Window;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Paints the window background behind the status / navigation bars in the app's own theme colour.
 * (When the WebView is padded below the system bars, that strip shows the window background, which the web
 * content cannot reach. Icon colour is set separately with Capacitor's SystemBars.setStyle.)
 */
@CapacitorPlugin(name = "ThemeBars")
public class ThemeBarsPlugin extends Plugin {

    @PluginMethod
    public void setBackground(PluginCall call) {
        String color = call.getString("color", "#f2f3f7");
        final int parsed;
        try {
            parsed = Color.parseColor(color);
        } catch (IllegalArgumentException e) {
            call.reject("Invalid colour: " + color);
            return;
        }
        getBridge().executeOnMainThread(() -> {
            Window w = getActivity().getWindow();
            w.getDecorView().setBackgroundColor(parsed);
            call.resolve();
        });
    }
}
