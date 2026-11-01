package com.cineftp.mobile;

import android.content.Intent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Opens the full-screen native (ExoPlayer) video player and returns where the user stopped watching. */
@CapacitorPlugin(name = "NativePlayer")
public class NativePlayerPlugin extends Plugin {

    @PluginMethod
    public void play(PluginCall call) {
        JSArray items = call.getArray("items");
        if (items == null || items.length() == 0) {
            call.reject("No video to play");
            return;
        }
        Integer index = call.getInt("index", 0);
        Double position = call.getDouble("position", 0.0);
        Intent intent = new Intent(getContext(), PlayerActivity.class);
        intent.putExtra("items", items.toString());
        intent.putExtra("index", index == null ? 0 : index);
        intent.putExtra("position", (long) ((position == null ? 0.0 : position) * 1000.0));
        startActivityForResult(call, intent, "onPlayerResult");
    }

    @ActivityCallback
    private void onPlayerResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject out = new JSObject();
        Intent data = result.getData();
        out.put("index", data != null ? data.getIntExtra("index", 0) : 0);
        out.put("position", data != null ? data.getLongExtra("position", 0L) / 1000.0 : 0.0);
        out.put("duration", data != null ? data.getLongExtra("duration", 0L) / 1000.0 : 0.0);
        String error = data != null ? data.getStringExtra("error") : null;
        if (error != null) out.put("error", error);
        call.resolve(out);
    }
}
