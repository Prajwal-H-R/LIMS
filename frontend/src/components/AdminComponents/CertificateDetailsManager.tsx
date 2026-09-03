// src/components/htw/CertificateDetailsManager.tsx

import React, {
  useCallback,
  useEffect,
  useState,
  FormEvent,
} from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  Eye,
  FileText,
  Loader2,
  Plus,
  Save,
  Trash2,
  X,
  AlertCircle,
  CheckCircle2,
  GripVertical,
} from 'lucide-react';

import { api, ENDPOINTS } from '../../api/config';

// ============================================================================
// TYPES
// ============================================================================

export interface CertificateStatement {
  order: number;
  text: string;
}

export interface CertificateDetails {
  certificate_details_id: number;
  calibration_procedure: string | null;
  statement_below_signature: CertificateStatement[] | null;
  created_at: string;
  updated_at: string;
}

interface CertificateDetailsManagerProps {
  onBack: () => void;
}

interface CertificateDetailsFormData {
  calibration_procedure: string;
  statement_below_signature: CertificateStatement[];
}

// ============================================================================
// SKELETON
// ============================================================================

const SkeletonLoader = () => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-20 animate-pulse">
    <div className="p-6 space-y-4">
      <div className="h-5 w-40 bg-slate-200 rounded" />
      <div className="h-4 w-full bg-slate-200 rounded" />
      <div className="h-4 w-5/6 bg-slate-200 rounded" />
      <div className="h-4 w-4/6 bg-slate-200 rounded" />
    </div>
  </div>
);

// ============================================================================
// MAIN MANAGER
// ============================================================================

export const CertificateDetailsManager: React.FC<
  CertificateDetailsManagerProps
> = ({ onBack }) => {
  const [data, setData] = useState<CertificateDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<'list' | 'form'>('list');
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      /*
       * This endpoint should return an array:
       * GET /certificate-details
       *
       * Because certificate_details is a singleton configuration,
       * only the first record is used by the UI.
       */
      const response = await api.get<CertificateDetails[]>(
        ENDPOINTS.CERTIFICATE_DETAILS.LIST
      );

      const rows = response.data || [];

      if (rows.length === 0) {
        setData(null);
      } else {
        // Defensive handling in case more than one row exists.
        // The backend should enforce the singleton rule.
        const latest = [...rows].sort(
          (a, b) =>
            Number(b.certificate_details_id) -
            Number(a.certificate_details_id)
        )[0];

        const statements = [...(latest.statement_below_signature || [])]
          .filter(
            (item) =>
              item &&
              typeof item.text === 'string' &&
              item.text.trim().length > 0
          )
          .sort((a, b) => a.order - b.order);

        setData({
          ...latest,
          statement_below_signature: statements,
        });
      }
    } catch (err: any) {
      console.error(err);
      setError(
        err.response?.data?.detail ||
          'Failed to load certificate configuration.'
      );
    } finally {
      setTimeout(() => setLoading(false), 250);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    document.body.style.overflow =
      isViewModalOpen || isDeleteModalOpen ? 'hidden' : 'unset';

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isViewModalOpen, isDeleteModalOpen]);

  const handleAddOrEdit = () => {
    setError(null);
    setViewMode('form');
  };

  const handleView = () => {
    if (data) {
      setIsViewModalOpen(true);
    }
  };

  const handleDeleteClick = () => {
    if (!data) return;
    setIsDeleteModalOpen(true);
  };

  const handleDelete = async () => {
    if (!data) return;

    try {
      setDeleting(true);
      setError(null);

      await api.delete(
        ENDPOINTS.CERTIFICATE_DETAILS.DELETE(
          data.certificate_details_id
        )
      );

      setData(null);
      setIsDeleteModalOpen(false);
    } catch (err: any) {
      console.error(err);

      // Keep modal open so the user can see the failure.
      alert(
        err.response?.data?.detail ||
          'Failed to delete certificate configuration.'
      );
    } finally {
      setDeleting(false);
    }
  };

  const handleSave = async (
    payload: CertificateDetailsFormData
  ) => {
    setSubmitting(true);

    try {
      setError(null);

      // Normalize statement order before sending.
      const normalizedStatements = payload.statement_below_signature
        .map((item, index) => ({
          order: index + 1,
          text: item.text.trim(),
        }))
        .filter((item) => item.text.length > 0);

      const requestPayload = {
        calibration_procedure:
          payload.calibration_procedure.trim() || null,
        statement_below_signature: normalizedStatements,
      };

      if (data) {
        await api.patch(
          ENDPOINTS.CERTIFICATE_DETAILS.UPDATE(
            data.certificate_details_id
          ),
          requestPayload
        );
      } else {
        await api.post(
          ENDPOINTS.CERTIFICATE_DETAILS.CREATE,
          requestPayload
        );
      }

      await fetchData();
      setViewMode('list');
    } catch (err: any) {
      console.error(err);
      throw err;
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return '-';

    return new Date(dateString).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (viewMode === 'form') {
    return (
      <CertificateDetailsForm
        existingData={data}
        submitting={submitting}
        onCancel={() => setViewMode('list')}
        onSave={handleSave}
      />
    );
  }

  return (
    <div className="animate-fadeIn">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div className="flex items-center">
          <button
            onClick={onBack}
            className="mr-4 p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 shadow-sm transition-colors"
          >
            <ArrowLeft size={20} />
          </button>

          <div>
            <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <FileText size={24} className="text-blue-500" />
              Certificate Details
            </h3>
            <p className="text-sm text-gray-500">
              Manage the Calibration Procedure and statements shown below the
              signature.
            </p>
          </div>
        </div>

        <button
          onClick={handleAddOrEdit}
          disabled={submitting}
          className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm transition-colors disabled:opacity-60"
        >
          {data ? (
            <>
              <Save size={16} className="mr-2" />
              Edit Configuration
            </>
          ) : (
            <>
              <Plus size={16} className="mr-2" />
              Add Configuration
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2">
          <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <SkeletonLoader />
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-20">
          {/* SINGLE RECORD SUMMARY */}
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <div>
              <h4 className="font-bold text-gray-900">
                Certificate Template Configuration
              </h4>
              <p className="text-sm text-gray-500 mt-1">
                Only one configuration record is permitted.
              </p>
            </div>

            {data ? (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">
                <CheckCircle2 size={12} className="mr-1" />
                CONFIGURED
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
                <AlertCircle size={12} className="mr-1" />
                NOT CONFIGURED
              </span>
            )}
          </div>

          {!data ? (
            <div className="px-6 py-12 text-center">
              <FileText
                size={40}
                className="mx-auto text-gray-300 mb-4"
              />
              <h4 className="font-semibold text-gray-800">
                No certificate configuration found
              </h4>
              <p className="text-sm text-gray-500 mt-1 mb-6">
                Add the single configuration record used by certificate
                generation.
              </p>

              <button
                onClick={handleAddOrEdit}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                <Plus size={16} className="mr-2" />
                Add Configuration
              </button>
            </div>
          ) : (
            <>
              <div className="p-6 space-y-6">
                {/* CALIBRATION PROCEDURE */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                      Calibration Procedure
                    </label>
                    <span className="text-xs text-gray-400">
                      {data.calibration_procedure?.length || 0} characters
                    </span>
                  </div>

                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-800 whitespace-pre-wrap">
                    {data.calibration_procedure || (
                      <span className="text-gray-400 italic">
                        No calibration procedure configured.
                      </span>
                    )}
                  </div>
                </div>

                {/* STATEMENTS */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                      Statements Below Signature
                    </label>
                    <span className="text-xs text-gray-400">
                      {data.statement_below_signature?.length || 0}{' '}
                      statements
                    </span>
                  </div>

                  <div className="space-y-2">
                    {(data.statement_below_signature || []).length ===
                    0 ? (
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-400 italic">
                        No statements configured.
                      </div>
                    ) : (
                      (data.statement_below_signature || [])
                        .sort((a, b) => a.order - b.order)
                        .map((statement) => (
                          <div
                            key={`${statement.order}-${statement.text}`}
                            className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 bg-white"
                          >
                            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center text-xs font-bold">
                              {statement.order}
                            </span>
                            <p className="text-sm text-gray-700 leading-6">
                              {statement.text}
                            </p>
                          </div>
                        ))
                    )}
                  </div>
                </div>

                {/* META */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-gray-100 pt-5">
                  <div>
                    <span className="block text-xs text-gray-500 mb-1">
                      Record ID
                    </span>
                    <span className="font-mono text-sm text-gray-800">
                      #{data.certificate_details_id}
                    </span>
                  </div>

                  <div>
                    <span className="block text-xs text-gray-500 mb-1">
                      Created
                    </span>
                    <span className="text-sm text-gray-800">
                      {formatDate(data.created_at)}
                    </span>
                  </div>

                  <div>
                    <span className="block text-xs text-gray-500 mb-1">
                      Last Updated
                    </span>
                    <span className="text-sm text-gray-800">
                      {formatDate(data.updated_at)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-2">
                <button
                  onClick={handleView}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <Eye size={16} className="mr-2" />
                  Preview
                </button>

                <button
                  onClick={handleAddOrEdit}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Save size={16} className="mr-2" />
                  Edit
                </button>

                <button
                  onClick={handleDeleteClick}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                >
                  <Trash2 size={16} className="mr-2" />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* PREVIEW MODAL */}
      {isViewModalOpen &&
        data &&
        createPortal(
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[99999] p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
              <div className="flex justify-between items-center p-6 border-b border-gray-100">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    Certificate Text Preview
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Exactly the configurable text available to the certificate
                    template.
                  </p>
                </div>
                <button
                  onClick={() => setIsViewModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 max-h-[70vh] overflow-y-auto space-y-6">
                <div>
                  <h4 className="text-xs font-bold uppercase text-gray-500 mb-2">
                    Calibration Procedure
                  </h4>
                  <div className="border rounded-lg p-4 text-sm text-gray-800 whitespace-pre-wrap">
                    {data.calibration_procedure || '-'}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold uppercase text-gray-500 mb-2">
                    Statements Below Signature
                  </h4>
                  <ol className="list-decimal pl-5 space-y-2">
                    {(data.statement_below_signature || [])
                      .sort((a, b) => a.order - b.order)
                      .map((statement) => (
                        <li
                          key={`${statement.order}-${statement.text}`}
                          className="text-sm text-gray-800 pl-1"
                        >
                          {statement.text}
                        </li>
                      ))}
                  </ol>
                </div>
              </div>

              <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                <button
                  onClick={() => setIsViewModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100"
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* DELETE MODAL */}
      {isDeleteModalOpen &&
        data &&
        createPortal(
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[99999] p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
              <div className="flex justify-between items-center p-6 border-b border-gray-100">
                <h3 className="text-lg font-bold text-gray-900">
                  Delete Certificate Configuration
                </h3>
                <button
                  onClick={() =>
                    !deleting && setIsDeleteModalOpen(false)
                  }
                  className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
                  disabled={deleting}
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6">
                <div className="p-4 rounded-lg bg-red-50 border border-red-100 text-sm text-red-800">
                  <p className="font-semibold mb-1">
                    This will remove the only certificate configuration.
                  </p>
                  <p>
                    Certificate generation will show blank configurable text
                    until a new configuration is added.
                  </p>
                </div>
              </div>

              <div className="p-4 bg-gray-50 flex justify-end gap-2">
                <button
                  onClick={() => setIsDeleteModalOpen(false)}
                  disabled={deleting}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-60"
                >
                  {deleting ? (
                    <Loader2 size={16} className="mr-2 animate-spin" />
                  ) : (
                    <Trash2 size={16} className="mr-2" />
                  )}
                  Delete
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

// ============================================================================
// FORM
// ============================================================================

interface CertificateDetailsFormProps {
  existingData: CertificateDetails | null;
  submitting: boolean;
  onCancel: () => void;
  onSave: (payload: CertificateDetailsFormData) => Promise<void>;
}

const CertificateDetailsForm: React.FC<CertificateDetailsFormProps> = ({
  existingData,
  submitting,
  onCancel,
  onSave,
}) => {
  const [formData, setFormData] = useState<CertificateDetailsFormData>(
    () => ({
      calibration_procedure: existingData?.calibration_procedure || '',
      statement_below_signature:
        existingData?.statement_below_signature?.length
          ? existingData.statement_below_signature
              .sort((a, b) => a.order - b.order)
              .map((item) => ({
                order: item.order,
                text: item.text,
              }))
          : [
              {
                order: 1,
                text: '',
              },
            ],
    })
  );

  const [error, setError] = useState<string | null>(null);

  const handleProcedureChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    setFormData((prev) => ({
      ...prev,
      calibration_procedure: e.target.value,
    }));
  };

  const handleStatementChange = (
    index: number,
    value: string
  ) => {
    setFormData((prev) => ({
      ...prev,
      statement_below_signature:
        prev.statement_below_signature.map((item, itemIndex) =>
          itemIndex === index
            ? { ...item, text: value }
            : item
        ),
    }));
  };

  const addStatement = () => {
    setFormData((prev) => ({
      ...prev,
      statement_below_signature: [
        ...prev.statement_below_signature,
        {
          order: prev.statement_below_signature.length + 1,
          text: '',
        },
      ],
    }));
  };

  const removeStatement = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      statement_below_signature: prev.statement_below_signature
        .filter((_, itemIndex) => itemIndex !== index)
        .map((item, itemIndex) => ({
          ...item,
          order: itemIndex + 1,
        })),
    }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const procedure = formData.calibration_procedure.trim();

    const statements = formData.statement_below_signature
      .map((item) => item.text.trim())
      .filter(Boolean)
      .map((text, index) => ({
        order: index + 1,
        text,
      }));

    if (!procedure) {
      setError('Calibration Procedure cannot be blank.');
      return;
    }

    if (statements.length === 0) {
      setError('Please add at least one statement below the signature.');
      return;
    }

    try {
      await onSave({
        calibration_procedure: procedure,
        statement_below_signature: statements,
      });
    } catch (err: any) {
      setError(
        err.response?.data?.detail ||
          'Failed to save certificate configuration.'
      );
    }
  };

  return (
    <div className="max-w-4xl mx-auto animate-fadeIn mb-20">
      <div className="mb-6">
        <button
          onClick={onCancel}
          disabled={submitting}
          className="flex items-center text-gray-500 hover:text-blue-600 transition-colors font-medium text-sm disabled:opacity-50"
        >
          <ArrowLeft size={16} className="mr-2" />
          Back to Certificate Details
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 bg-gray-50/50">
          <h3 className="text-xl font-bold text-gray-900 flex items-center">
            {existingData ? (
              <Save className="w-5 h-5 text-blue-500 mr-2" />
            ) : (
              <Plus className="w-5 h-5 text-blue-500 mr-2" />
            )}
            {existingData
              ? 'Update Certificate Details'
              : 'Add Certificate Details'}
          </h3>

          <p className="text-sm text-gray-500 mt-1">
            Configure the text used in the certificate. There can be only one
            configuration record.
          </p>
        </div>

        {error && (
          <div className="mx-6 mt-4 px-4 py-3 bg-red-50 border border-red-100 text-red-700 rounded-lg text-sm flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="p-6 space-y-8"
        >
          {/* CALIBRATION PROCEDURE */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <label className="block text-sm font-semibold text-gray-800">
                  Calibration Procedure
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  This text is shown in the Calibration Procedure box on page
                  1.
                </p>
              </div>

              <span className="text-xs text-gray-400">
                {formData.calibration_procedure.length} characters
              </span>
            </div>

            <textarea
              value={formData.calibration_procedure}
              onChange={handleProcedureChange}
              rows={4}
              required
              maxLength={1000}
              placeholder="Enter calibration procedure..."
              className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-y"
            />
          </div>

          {/* STATEMENTS */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <label className="block text-sm font-semibold text-gray-800">
                  Statements Below Signature
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  Statements are automatically numbered according to their
                  display order.
                </p>
              </div>

              <button
                type="button"
                onClick={addStatement}
                disabled={submitting}
                className="inline-flex items-center px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50"
              >
                <Plus size={15} className="mr-1.5" />
                Add Statement
              </button>
            </div>

            <div className="space-y-3">
              {formData.statement_below_signature.map(
                (statement, index) => (
                  <div
                    key={`statement-${index}`}
                    className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg bg-gray-50/50"
                  >
                    <div className="flex items-center justify-center w-8 h-10 text-gray-400">
                      <GripVertical size={18} />
                    </div>

                    <div className="flex-shrink-0 w-8 h-10 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center text-sm font-bold">
                      {index + 1}
                    </div>

                    <textarea
                      value={statement.text}
                      onChange={(e) =>
                        handleStatementChange(index, e.target.value)
                      }
                      rows={2}
                      placeholder={`Statement ${index + 1}`}
                      maxLength={1000}
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-y bg-white"
                    />

                    <button
                      type="button"
                      onClick={() => removeStatement(index)}
                      disabled={
                        submitting ||
                        formData.statement_below_signature.length <= 1
                      }
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
                      title={
                        formData.statement_below_signature.length <= 1
                          ? 'At least one statement is required'
                          : 'Remove statement'
                      }
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                )
              )}
            </div>

            <div className="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-800">
              <strong>Tip:</strong> The order is generated automatically from
              top to bottom and is persisted as <code>order: 1, 2, 3, 4.</code>{' '}
            </div>
          </div>

          {/* SINGLETON WARNING */}
          <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-100 rounded-lg text-sm text-amber-900">
            <AlertCircle
              size={18}
              className="mt-0.5 flex-shrink-0"
            />
            <div>
              <p className="font-bold">Single configuration record</p>
              <p className="mt-1">
                {existingData
                  ? 'You are editing the existing configuration. Saving will update the same record; it will not create a second record.'
                  : 'This will create the only certificate configuration record. Once created, future changes will update this same record.'}
              </p>
            </div>
          </div>

          {/* ACTIONS */}
          <div className="pt-4 flex items-center justify-end gap-3 border-t border-gray-100">
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="px-6 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center px-6 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm disabled:opacity-70 transition-all"
            >
              {submitting ? (
                <Loader2
                  className="animate-spin mr-2"
                  size={18}
                />
              ) : (
                <Save className="mr-2" size={18} />
              )}
              {existingData ? 'Update Configuration' : 'Save Configuration'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CertificateDetailsManager;
