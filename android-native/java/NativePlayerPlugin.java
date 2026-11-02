package com.cineftp.mobile;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.Uri;
import android.os.Environment;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.ByteArrayOutputStream;
import java.util.HashMap;
import android.graphics.Bitmap;
import android.media.MediaMetadataRetriever;
import android.util.Base64;
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
        Boolean software = call.getBoolean("software", false);
        Intent intent = new Intent(getContext(), PlayerActivity.class);
        intent.putExtra("software", software != null && software);
        intent.putExtra("items", items.toString());
        intent.putExtra("index", index == null ? 0 : index);
        intent.putExtra("position", (long) ((position == null ? 0.0 : position) * 1000.0));
        startActivityForResult(call, intent, "onPlayerResult");
    }

    /** Grabs one frame from a video address (used for per-episode thumbnails). Returns { data: "data:image/jpeg;base64,..." }. */
    @PluginMethod
    public void frame(final PluginCall call) {
        final String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("No url");
            return;
        }
        new Thread(() -> {
            MediaMetadataRetriever r = new MediaMetadataRetriever();
            try {
                HashMap<String, String> h = new HashMap<>();
                h.put("User-Agent", "Mozilla/5.0 (Linux; Android) CineFTP");
                r.setDataSource(url, h);
                long durMs = 0;
                try { durMs = Long.parseLong(r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)); } catch (Exception ignored) { }
                long at = durMs > 0 ? Math.min(durMs / 5, 600000L) : 60000L; // 20% in, at most 10 min
                Bitmap bmp = r.getFrameAtTime(at * 1000L, MediaMetadataRetriever.OPTION_CLOSEST_SYNC);
                if (bmp == null) bmp = r.getFrameAtTime(-1);
                if (bmp == null) { call.reject("no frame"); return; }
                int w = 480;
                int hgt = Math.max(1, bmp.getHeight() * w / Math.max(1, bmp.getWidth()));
                Bitmap small = Bitmap.createScaledBitmap(bmp, w, hgt, true);
                ByteArrayOutputStream bos = new ByteArrayOutputStream();
                small.compress(Bitmap.CompressFormat.JPEG, 70, bos);
                JSObject out = new JSObject();
                out.put("data", "data:image/jpeg;base64," + Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP));
                call.resolve(out);
            } catch (Throwable t) {
                call.reject("frame failed: " + t.getMessage());
            } finally {
                try { r.release(); } catch (Throwable ignored) { }
            }
        }).start();
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

    /** Downloads the new APK (with a system download notification) and opens the Android installer when done. */
    @PluginMethod
    public void installUpdate(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("No url");
            return;
        }
        try {
            final Context ctx = getContext();
            File dir = ctx.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            final File apk = new File(dir, "CineFTP-update.apk");
            if (apk.exists()) apk.delete();

            final DownloadManager dm = (DownloadManager) ctx.getSystemService(Context.DOWNLOAD_SERVICE);
            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url))
                .setTitle("CineFTP update")
                .setDescription("Downloading the new version")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalFilesDir(ctx, Environment.DIRECTORY_DOWNLOADS, "CineFTP-update.apk");
            final long id = dm.enqueue(req);

            BroadcastReceiver done = new BroadcastReceiver() {
                @Override
                public void onReceive(Context c, Intent i) {
                    if (i.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L) != id) return;
                    try { c.unregisterReceiver(this); } catch (Exception ignored) {}
                    try {
                        Uri uri = FileProvider.getUriForFile(c, c.getPackageName() + ".fileprovider", apk);
                        Intent install = new Intent(Intent.ACTION_VIEW)
                            .setDataAndType(uri, "application/vnd.android.package-archive")
                            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                        c.startActivity(install);
                    } catch (Exception ignored) {}
                }
            };
            ContextCompat.registerReceiver(ctx, done,
                new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE), ContextCompat.RECEIVER_EXPORTED);
            call.resolve();
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }
}
