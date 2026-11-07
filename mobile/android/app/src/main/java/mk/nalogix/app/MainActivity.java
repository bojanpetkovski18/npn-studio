package mk.nalogix.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ThemeBarsPlugin.class); // app-local plugin: theme colour behind the system bars
        super.onCreate(savedInstanceState);
    }
}
