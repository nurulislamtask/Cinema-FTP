package com.cineftp.mobile;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CodingErrorAction;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.zip.GZIPInputStream;

/** Looks up subtitles for the movie / episode that is playing (OpenSubtitles public search) and downloads one. */
final class SubtitleFinder {
    static final class Result {
        String label;
        String link;
        String lang;
        int downloads;
        boolean exactYear;
    }

    private SubtitleFinder() {}

    static List<Result> search(String query, int year, int season, int episode, String lang) throws Exception {
        StringBuilder p = new StringBuilder("https://rest.opensubtitles.org/search/");
        if (episode > 0) p.append("episode-").append(episode).append('/');
        p.append("query-").append(URLEncoder.encode(query.toLowerCase(Locale.ROOT), "UTF-8").replace("+", "%20")).append('/');
        if (season > 0) p.append("season-").append(season).append('/');
        p.append("sublanguageid-").append(lang);

        HttpURLConnection c = (HttpURLConnection) new URL(p.toString()).openConnection();
        c.setConnectTimeout(12000);
        c.setReadTimeout(20000);
        c.setRequestProperty("User-Agent", "TemporaryUserAgent");
        if (c.getResponseCode() != 200) throw new Exception("HTTP " + c.getResponseCode());
        String body = new String(readAll(c.getInputStream()), "UTF-8");
        JSONArray arr = new JSONArray(body);

        List<Result> out = new ArrayList<>();
        for (int i = 0; i < arr.length(); i++) {
            JSONObject o = arr.getJSONObject(i);
            String link = o.optString("SubDownloadLink", "");
            if (link.isEmpty()) continue;
            String fmt = o.optString("SubFormat", "srt");
            if (!"srt".equalsIgnoreCase(fmt)) continue;
            Result r = new Result();
            r.link = link;
            r.lang = o.optString("ISO639", lang);
            r.downloads = parseInt(o.optString("SubDownloadsCnt", "0"));
            String rel = o.optString("MovieReleaseName", "");
            if (rel.isEmpty()) rel = o.optString("SubFileName", o.optString("MovieName", "Subtitle"));
            r.label = rel + "  ·  ↓" + r.downloads;
            r.exactYear = year > 0 && parseInt(o.optString("MovieYear", "0")) == year;
            out.add(r);
        }
        Collections.sort(out, (a, b) -> {
            if (a.exactYear != b.exactYear) return a.exactYear ? -1 : 1;
            return Integer.compare(b.downloads, a.downloads);
        });
        return out.size() > 20 ? new ArrayList<>(out.subList(0, 20)) : out;
    }

    static File download(Context ctx, String link) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(link).openConnection();
        c.setConnectTimeout(12000);
        c.setReadTimeout(25000);
        c.setRequestProperty("User-Agent", "TemporaryUserAgent");
        if (c.getResponseCode() != 200) throw new Exception("HTTP " + c.getResponseCode());
        InputStream in = c.getInputStream();
        byte[] raw = link.toLowerCase(Locale.ROOT).endsWith(".gz") ? readAll(new GZIPInputStream(in)) : readAll(in);
        String text = decode(raw);
        File f = new File(ctx.getCacheDir(), "sub_" + System.currentTimeMillis() + ".srt");
        try (FileOutputStream fo = new FileOutputStream(f)) {
            fo.write(text.getBytes("UTF-8"));
        }
        return f;
    }

    private static String decode(byte[] raw) {
        try {
            return Charset.forName("UTF-8").newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(raw)).toString();
        } catch (CharacterCodingException e) {
            return new String(raw, Charset.forName("windows-1252"));
        }
    }

    private static byte[] readAll(InputStream in) throws Exception {
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) {
            bo.write(buf, 0, n);
            if (bo.size() > 8 * 1024 * 1024) break;
        }
        in.close();
        return bo.toByteArray();
    }

    private static int parseInt(String s) {
        try {
            return Integer.parseInt(s.trim());
        } catch (Exception e) {
            return 0;
        }
    }
}
