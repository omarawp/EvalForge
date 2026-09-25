import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Plus } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { api, json } from "../api";
import type { Dataset } from "../types";
import { date, Empty, ErrorMessage, Loading, PageHeader, Panel } from "../ui";

export default function DatasetsPage() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [showForm, setShowForm] = useState(false);
  const query = useQuery({
    queryKey: ["datasets"],
    queryFn: () => api<Dataset[]>("/datasets"),
  });
  const create = useMutation({
    mutationFn: () =>
      api<Dataset>("/datasets", json("POST", { name, description })),
    onSuccess: (dataset) => {
      client.invalidateQueries({ queryKey: ["datasets"] });
      navigate(`/datasets/${dataset.id}`);
    },
  });
  return (
    <>
      <PageHeader
        eyebrow="TEST DATA"
        title="Datasets"
        description="Build reusable collections of cases for repeatable model evaluation."
        action={
          <button
            className="button primary"
            onClick={() => setShowForm((v) => !v)}
          >
            <Plus size={16} /> New dataset
          </button>
        }
      />
      {showForm && (
        <Panel title="Create a dataset" className="form-panel">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate();
            }}
            className="form-grid"
          >
            <label>
              Name
              <input
                required
                maxLength={160}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Customer support QA"
              />
            </label>
            <label>
              Description
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What this dataset measures"
              />
            </label>
            <div>
              <button className="button primary" disabled={create.isPending}>
                Create dataset
              </button>
            </div>
            <ErrorMessage error={create.error} />
          </form>
        </Panel>
      )}
      <Panel
        title="All datasets"
        action={
          <span className="count">{query.data?.length ?? 0} collections</span>
        }
      >
        {query.isLoading ? (
          <Loading />
        ) : query.error ? (
          <ErrorMessage error={query.error} />
        ) : query.data?.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Cases</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {query.data.map((dataset) => (
                  <tr key={dataset.id}>
                    <td>
                      <Link
                        className="table-link"
                        to={`/datasets/${dataset.id}`}
                      >
                        {dataset.name}
                      </Link>
                    </td>
                    <td className="muted">{dataset.description || "—"}</td>
                    <td className="mono">{dataset.test_case_count}</td>
                    <td className="muted">{date(dataset.created_at)}</td>
                    <td>
                      <Link
                        className="row-arrow"
                        to={`/datasets/${dataset.id}`}
                      >
                        <ArrowRight size={16} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="No datasets yet"
            body="Create a dataset to start collecting test cases."
          />
        )}
      </Panel>
    </>
  );
}
