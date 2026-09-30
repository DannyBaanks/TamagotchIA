package io.github.dannybaanks.tamagotchia;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local plugins must be registered before the bridge starts.
        registerPlugin(GusLocalPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
