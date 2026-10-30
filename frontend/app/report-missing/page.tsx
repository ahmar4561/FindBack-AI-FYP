"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function ReportMissingPage() {
  const router = useRouter();

  const [imageName, setImageName] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingUser, setCheckingUser] = useState(true);

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [caseNumber, setCaseNumber] = useState("");

  // Missing person information
  const [fullName, setFullName] = useState("");
  const [cnicPakId, setCnicPakId] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [height, setHeight] = useState("");

  // Optional supporting attributes
  const [hair, setHair] = useState("");
  const [eyeColor, setEyeColor] = useState("");
  const [clothing, setClothing] = useState("");
  const [distinguishingMarks, setDistinguishingMarks] = useState("");

  // Last seen information
  const [lastSeenLocation, setLastSeenLocation] = useState("");
  const [lastSeenDate, setLastSeenDate] = useState("");
  const [additionalDetails, setAdditionalDetails] = useState("");

  // Reporter information
  const [reporterName, setReporterName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [reporterPhone, setReporterPhone] = useState("");
  const [reporterEmail, setReporterEmail] = useState("");

  /* ================= CHECK LOGIN ================= */

  useEffect(() => {
    async function checkUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      setReporterName(user.user_metadata?.full_name || "");
      setReporterEmail(user.email || "");
      setReporterPhone(user.user_metadata?.phone || "");

      setCheckingUser(false);
    }

    checkUser();
  }, [router]);

  /* ================= CASE NUMBER ================= */

  function generateCaseNumber() {
    const year = new Date().getFullYear();

    const randomCode = Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase();

    return `FB-M-${year}-${randomCode}`;
  }

  /* ================= SUBMIT REPORT ================= */

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setErrorMessage("");
    setSuccessMessage("");
    setCaseNumber("");

    if (!fullName.trim()) {
      setErrorMessage("Please enter the missing person's full name.");
      return;
    }

    if (!lastSeenLocation.trim()) {
      setErrorMessage("Please enter the last seen location.");
      return;
    }

    if (!relationship) {
      setErrorMessage("Please select your relationship.");
      return;
    }

    if (!reporterPhone.trim()) {
      setErrorMessage("Please enter your phone number.");
      return;
    }

    if (!imageFile) {
      setErrorMessage(
        "Please upload a clear recent photo of the missing person."
      );
      return;
    }

    try {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const newCaseNumber = generateCaseNumber();

      let imagePath: string | null = null;

      /* ================= IMAGE VALIDATION ================= */

      if (!["image/jpeg", "image/png"].includes(imageFile.type)) {
        setErrorMessage("Only JPG, JPEG or PNG images are allowed.");
        return;
      }

      if (imageFile.size > 5 * 1024 * 1024) {
        setErrorMessage("Image size must be 5 MB or less.");
        return;
      }

      const extension =
        imageFile.name.split(".").pop()?.toLowerCase() ||
        (imageFile.type === "image/png" ? "png" : "jpg");

      imagePath = `${user.id}/${newCaseNumber.toLowerCase()}.${extension}`;

      /* ================= UPLOAD IMAGE ================= */

      const { error: uploadError } = await supabase.storage
        .from("missing-person-images")
        .upload(imagePath, imageFile, {
          cacheControl: "3600",
          upsert: false,
          contentType: imageFile.type,
        });

      if (uploadError) {
        setErrorMessage(`Photo upload failed: ${uploadError.message}`);
        return;
      }

      /* ================= INSERT REPORT ================= */

      const { data: saved, error } = await supabase
        .from("missing_reports")
        .insert({
          case_number: newCaseNumber,
          reporter_id: user.id,

          full_name: fullName.trim(),

          cnic_pak_id: cnicPakId.trim() || null,

          approximate_age: age ? Number(age) : null,

          gender: gender || null,

          height: height.trim() || null,

          hair: hair.trim() || null,

          eye_color: eyeColor.trim() || null,

          clothing: clothing.trim() || null,

          distinguishing_marks:
            distinguishingMarks.trim() || null,

          last_seen_location:
            lastSeenLocation.trim(),

          last_seen_date:
            lastSeenDate || null,

          additional_details:
            additionalDetails.trim() || null,

          image_url: imagePath,

          relationship: relationship,

          reporter_phone:
            reporterPhone.trim(),

          reporter_email:
            reporterEmail.trim() ||
            user.email ||
            null,

          status: "open",
        })
        .select("id")
        .single();

      if (error) {
        // Remove uploaded image if DB insert fails
        if (imagePath) {
          await supabase.storage
            .from("missing-person-images")
            .remove([imagePath]);
        }

        setErrorMessage(error.message);
        return;
      }

      /* ================= AUTOMATIC AI MATCHING ================= */

      if (saved?.id) {
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();

          if (session?.access_token) {
            const apiUrl =
              process.env.NEXT_PUBLIC_API_URL ||
              "http://127.0.0.1:8001";

            void fetch(
              `${apiUrl}/reports/missing/${saved.id}/auto-match`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${session.access_token}`,
                },
              }
            ).catch(() => {
              // Report is already saved.
              // Matching failure must not cancel submission.
            });
          }
        } catch {
          // Report remains successfully submitted even if
          // automatic matching cannot be started.
        }
      }

      /* ================= SUCCESS ================= */

      setCaseNumber(newCaseNumber);

      setSuccessMessage(
        "Missing person report submitted successfully."
      );

      /* Clear person fields */

      setFullName("");
      setCnicPakId("");
      setAge("");
      setGender("");
      setHeight("");

      setHair("");
      setEyeColor("");
      setClothing("");
      setDistinguishingMarks("");

      setLastSeenLocation("");
      setLastSeenDate("");
      setAdditionalDetails("");

      setRelationship("");

      setImageName("");
      setImageFile(null);
    } catch {
      setErrorMessage(
        "Something went wrong while submitting the report."
      );
    } finally {
      setLoading(false);
    }
  }

  /* ================= LOADING ================= */

  if (checkingUser) {
    return (
      <main className="min-h-screen bg-[#07111f] text-white flex items-center justify-center">
        <p className="text-cyan-400">
          Checking your account...
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#07111f] text-white">

      {/* ================= HEADER ================= */}

      <nav className="border-b border-white/10 px-6 md:px-10 py-5">
        <div className="max-w-6xl mx-auto flex justify-between items-center">

          <a
            href="/"
            className="text-2xl font-bold"
          >
            FindBack
            <span className="text-cyan-400">
              AI
            </span>
          </a>

          <a
            href="/dashboard"
            className="text-sm text-slate-400 hover:text-white transition"
          >
            ← Back to Dashboard
          </a>

        </div>
      </nav>

      {/* ================= PAGE ================= */}

      <section className="max-w-4xl mx-auto px-6 py-12">

        {/* Heading */}

        <div className="mb-10">

          <span className="text-xs text-cyan-400 tracking-widest">
            MISSING PERSON REPORT
          </span>

          <h1 className="text-4xl font-bold mt-3">
            Help Us Find Someone
          </h1>

          <p className="text-slate-400 mt-3">
            Provide accurate information about the missing person.
            A clear photo is required for AI-assisted face matching,
            while physical attributes are optional supporting information.
          </p>

        </div>

        {/* ================= FORM ================= */}

        <form
          onSubmit={handleSubmit}
          className="border border-white/10 bg-white/[0.03] rounded-3xl p-6 md:p-10"
        >

          {/* ================= PERSONAL INFORMATION ================= */}

          <h2 className="text-xl font-semibold mb-6">
            Personal Information
          </h2>

          <div className="grid md:grid-cols-2 gap-5">

            <Input
              label="Full Name"
              placeholder="Enter full name"
              value={fullName}
              onChange={setFullName}
              required
            />

            <Input
              label="CNIC / PAK-ID (Optional)"
              placeholder="e.g. 41304-1234567-1"
              value={cnicPakId}
              onChange={setCnicPakId}
            />

            <Input
              label="Approximate Age (Optional)"
              placeholder="e.g. 24"
              type="number"
              value={age}
              onChange={setAge}
            />

            <Select
              label="Gender (Optional)"
              value={gender}
              onChange={setGender}
              options={[
                {
                  value: "",
                  label: "Select gender",
                },
                {
                  value: "Male",
                  label: "Male",
                },
                {
                  value: "Female",
                  label: "Female",
                },
                {
                  value: "Other",
                  label: "Other",
                },
              ]}
            />

            <Input
              label="Height (Optional)"
              placeholder="e.g. 5 ft 8 in"
              value={height}
              onChange={setHeight}
            />

          </div>

          {/* ================= APPEARANCE ================= */}

          <div className="border-t border-white/10 my-9" />

          <h2 className="text-xl font-semibold mb-2">
            Appearance & Identification
          </h2>

          <p className="text-sm text-slate-500 mb-6">
            These are optional supporting attributes.
            Add them only if the information is available.
          </p>

          <div className="grid md:grid-cols-2 gap-5">

            <Input
              label="Hair (Optional)"
              placeholder="e.g. Black, short"
              value={hair}
              onChange={setHair}
            />

            <Input
              label="Eye Color (Optional)"
              placeholder="e.g. Brown"
              value={eyeColor}
              onChange={setEyeColor}
            />

            <Input
              label="Clothing When Last Seen (Optional)"
              placeholder="e.g. Blue shirt, black trousers"
              value={clothing}
              onChange={setClothing}
            />

            <Input
              label="Distinguishing Mark (Optional)"
              placeholder="Scar, birthmark etc."
              value={distinguishingMarks}
              onChange={setDistinguishingMarks}
            />

          </div>

          {/* ================= LAST SEEN ================= */}

          <div className="border-t border-white/10 my-9" />

          <h2 className="text-xl font-semibold mb-6">
            Last Seen Information
          </h2>

          <div className="grid md:grid-cols-2 gap-5">

            <Input
              label="Last Seen Location"
              placeholder="City / Area / Location"
              value={lastSeenLocation}
              onChange={setLastSeenLocation}
              required
            />

            <Input
              label="Last Seen Date (Optional)"
              type="date"
              value={lastSeenDate}
              onChange={setLastSeenDate}
            />

          </div>

          <div className="mt-5">

            <label className="text-sm text-slate-300">
              Additional Details (Optional)
            </label>

            <textarea
              rows={4}
              value={additionalDetails}
              onChange={(e) =>
                setAdditionalDetails(e.target.value)
              }
              placeholder="Any additional information that may help identify the person..."
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-cyan-400/50 text-white placeholder:text-slate-600"
            />

          </div>

          {/* ================= PHOTO ================= */}

          <div className="border-t border-white/10 my-9" />

          <h2 className="text-xl font-semibold mb-3">
            Person Photo
            <span className="text-red-400"> *</span>
          </h2>

          <p className="text-sm text-slate-500 mb-5">
            A clear recent photo is required for AI-based face matching.
            JPG, JPEG or PNG only, maximum 5 MB.
          </p>

          <label className="block cursor-pointer border-2 border-dashed border-white/10 hover:border-cyan-400/40 rounded-2xl p-8 text-center transition">

            <div className="text-3xl mb-3">
              ＋
            </div>

            <p className="text-sm">
              {imageName ||
                "Click to upload person photo"}
            </p>

            <p className="text-xs text-slate-500 mt-2">
              Required • JPG, JPEG or PNG • Maximum 5 MB
            </p>

            <input
              type="file"
              accept="image/png,image/jpeg"
              required
              className="hidden"
              onChange={(e) => {
                const file =
                  e.target.files?.[0] || null;

                setErrorMessage("");

                if (!file) {
                  setImageFile(null);
                  setImageName("");
                  return;
                }

                if (
                  ![
                    "image/jpeg",
                    "image/png",
                  ].includes(file.type)
                ) {
                  setImageFile(null);
                  setImageName("");
                  e.target.value = "";

                  setErrorMessage(
                    "Only JPG, JPEG or PNG images are allowed."
                  );

                  return;
                }

                if (
                  file.size >
                  5 * 1024 * 1024
                ) {
                  setImageFile(null);
                  setImageName("");
                  e.target.value = "";

                  setErrorMessage(
                    "Image size must be 5 MB or less."
                  );

                  return;
                }

                setImageFile(file);
                setImageName(file.name);
              }}
            />

          </label>

          {/* ================= REPORTER ================= */}

          <div className="border-t border-white/10 my-9" />

          <h2 className="text-xl font-semibold mb-6">
            Reporter Information
          </h2>

          <div className="grid md:grid-cols-2 gap-5">

            <Input
              label="Reporter Name"
              placeholder="Your full name"
              value={reporterName}
              onChange={setReporterName}
            />

            <Select
              label="Relationship"
              value={relationship}
              onChange={setRelationship}
              options={[
                {
                  value: "",
                  label: "Select relationship",
                },
                {
                  value: "Parent",
                  label: "Parent",
                },
                {
                  value: "Brother / Sister",
                  label: "Brother / Sister",
                },
                {
                  value: "Spouse",
                  label: "Spouse",
                },
                {
                  value: "Relative",
                  label: "Relative",
                },
                {
                  value: "Friend",
                  label: "Friend",
                },
                {
                  value: "Legal Guardian",
                  label: "Legal Guardian",
                },
                {
                  value: "Other",
                  label: "Other",
                },
              ]}
            />

            <Input
              label="Phone Number"
              placeholder="+92..."
              value={reporterPhone}
              onChange={setReporterPhone}
              required
            />

            <Input
              label="Email Address (Optional)"
              placeholder="example@email.com"
              type="email"
              value={reporterEmail}
              onChange={setReporterEmail}
            />

          </div>

          {/* ================= PRIVACY ================= */}

          <div className="mt-8 bg-cyan-400/5 border border-cyan-400/10 rounded-xl p-4">

            <p className="text-xs text-slate-400 leading-6">
              🔒 Sensitive information, including CNIC/PAK-ID
              and contact details, will not be publicly exposed.
              Submitted reports may require verification before
              becoming active in the matching system.
            </p>

          </div>

          {/* ================= ERROR ================= */}

          {errorMessage && (
            <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {errorMessage}
            </div>
          )}

          {/* ================= SUCCESS ================= */}

          {successMessage && (
            <div className="mt-6 rounded-xl border border-green-500/20 bg-green-500/10 p-5">

              <p className="font-semibold text-green-300">
                ✓ {successMessage}
              </p>

              <p className="text-sm text-slate-300 mt-3">
                Your Case Number:
              </p>

              <p className="text-xl font-bold text-cyan-400 mt-1">
                {caseNumber}
              </p>

              <p className="text-xs text-slate-400 mt-3">
                Keep this case number for tracking your report.
              </p>

            </div>
          )}

          {/* ================= SUBMIT ================= */}

          <button
            type="submit"
            disabled={loading}
            className="mt-8 w-full bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-bold py-4 rounded-xl transition"
          >
            {loading
              ? "Submitting Report..."
              : "Submit Missing Person Report"}
          </button>

        </form>

      </section>

    </main>
  );
}

/* ================= INPUT ================= */

function Input({
  label,
  placeholder,
  type = "text",
  value,
  onChange,
  required = false,
}: {
  label: string;
  placeholder?: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <div>

      <label className="text-sm text-slate-300">
        {label}
        {required && (
          <span className="text-red-400"> *</span>
        )}
      </label>

      <input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) =>
          onChange(e.target.value)
        }
        className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-cyan-400/50 text-white placeholder:text-slate-600"
      />

    </div>
  );
}

/* ================= SELECT ================= */

function Select({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: {
    value: string;
    label: string;
  }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>

      <label className="text-sm text-slate-300">
        {label}
      </label>

      <select
        value={value}
        onChange={(e) =>
          onChange(e.target.value)
        }
        className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b1727] px-4 py-3 outline-none focus:border-cyan-400/50 text-slate-300"
      >

        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
          >
            {option.label}
          </option>
        ))}

      </select>

    </div>
  );
}